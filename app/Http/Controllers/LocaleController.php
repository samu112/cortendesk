<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * POST /locale: the language menu in the top bar and on the sign-in page.
 *
 * The choice is kept in the session (so it works before signing in and carries
 * over the login) and, for a signed-in user, saved on the account like the
 * theme, so it holds in every browser.
 */
class LocaleController extends Controller
{
    public function update(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'locale' => ['required', 'string', Rule::in(array_keys(User::LOCALES))],
        ]);

        $request->session()->put('locale', $validated['locale']);
        $request->user()?->forceFill(['locale' => $validated['locale']])->save();

        return redirect()->back(fallback: route('login'));
    }
}
