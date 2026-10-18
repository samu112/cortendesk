<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A saved server for the web client, as the user typed it: an ID server, a
 * relay server and a public key, each optional (empty = RustDesk's default, the
 * same as in the desktop client). The browser turns the addresses into
 * WebSocket URLs. Belongs to one user; no password or token is stored.
 */
#[Fillable(['name', 'id_server', 'relay_server', 'server_key'])]
class ServerProfile extends Model
{
    /** Per user, so the picker stays a short list. */
    public const MAX_PER_USER = 25;

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** The shape the web client reads. */
    public function toClient(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'idServer' => (string) $this->id_server,
            'relayServer' => (string) $this->relay_server,
            'serverKey' => (string) $this->server_key,
        ];
    }
}
