<?php

namespace App\Http\Controllers;

use App\Models\ConsoleAudit;
use App\Models\ServerProfile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * JSON endpoints behind the web client's "server profiles" dialog: a user's own
 * saved ID/relay servers. Every query is scoped to the signed-in user, so one
 * account can never read or change another's profiles.
 */
class WebClientProfileController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(self::profilesFor($request));
    }

    public function store(Request $request): JsonResponse
    {
        if ($request->user()->serverProfiles()->count() >= ServerProfile::MAX_PER_USER) {
            throw ValidationException::withMessages([
                'name' => __('messages.server_profile_limit', ['max' => ServerProfile::MAX_PER_USER]),
            ]);
        }

        $profile = $request->user()->serverProfiles()->create($this->validated($request));

        ConsoleAudit::record('webclient.profile-create', 'Saved web client server profile '.$profile->name, 'server-profile', (string) $profile->id);

        return response()->json($profile->toClient(), 201);
    }

    public function update(Request $request, int $profile): JsonResponse
    {
        $profile = $this->own($request, $profile);
        $profile->update($this->validated($request, $profile));

        ConsoleAudit::record('webclient.profile-update', 'Updated web client server profile '.$profile->name, 'server-profile', (string) $profile->id);

        return response()->json($profile->toClient());
    }

    public function destroy(Request $request, int $profile): JsonResponse
    {
        $profile = $this->own($request, $profile);
        $id = (string) $profile->id;
        $name = $profile->name;
        $profile->delete();

        ConsoleAudit::record('webclient.profile-delete', 'Deleted web client server profile '.$name, 'server-profile', $id);

        return response()->json(['ok' => true]);
    }

    /** @return list<array<string, mixed>> The signed-in user's profiles, as the web client reads them. */
    public static function profilesFor(Request $request): array
    {
        return $request->user()->serverProfiles()->orderBy('name')->get()
            ->map(fn (ServerProfile $p) => $p->toClient())->all();
    }

    /** The signed-in user's own profile, or a plain 404 (never another user's, never a model name). */
    private function own(Request $request, int $id): ServerProfile
    {
        return $request->user()->serverProfiles()->find($id) ?? abort(404);
    }

    /** @return array{name: string, id_server: ?string, relay_server: ?string, server_key: ?string} */
    private function validated(Request $request, ?ServerProfile $ignore = null): array
    {
        // A host name or IP with an optional port, or a full ws:// / wss:// URL.
        // Empty is fine: it means RustDesk's default, as in the desktop client.
        $address = ['nullable', 'string', 'max:255',
            'regex:/^(wss?:\/\/[^\s\/?#]+[^\s]*|[A-Za-z0-9]([A-Za-z0-9.\-]*[A-Za-z0-9])?(:\d{1,5})?)$/i'];

        $data = $request->validate([
            'name' => ['required', 'string', 'max:64', Rule::unique('server_profiles', 'name')
                ->where('user_id', $request->user()->id)->ignore($ignore?->id)],
            'idServer' => $address,
            'relayServer' => $address,
            'serverKey' => ['nullable', 'string', 'max:255', function (string $attribute, mixed $value, \Closure $fail) {
                // The web client verifies the relay with this key, so it has to
                // be exactly a base64 ed25519 public key (32 bytes).
                $raw = base64_decode(trim((string) $value), true);
                if ($raw === false || strlen($raw) !== 32) {
                    $fail(__('messages.server_profile_key_invalid'));
                }
            }],
        ], [
            'idServer.regex' => __('messages.server_profile_url_invalid'),
            'relayServer.regex' => __('messages.server_profile_url_invalid'),
        ]);

        $clean = fn (?string $v): ?string => ($v = trim((string) $v)) === '' ? null : $v;

        return [
            'name' => trim($data['name']),
            'id_server' => $clean($data['idServer'] ?? null),
            'relay_server' => $clean($data['relayServer'] ?? null),
            'server_key' => $clean($data['serverKey'] ?? null),
        ];
    }
}
