<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Arr;

/**
 * Fails when the translation files drift: a key used in code but missing from
 * English, a language that lacks a key English has, a placeholder (":name")
 * that one language dropped or renamed, or an English key nothing uses.
 *
 *   php artisan lang:check
 */
class LangCheck extends Command
{
    protected $signature = 'lang:check';

    protected $description = 'Check the lang/ files for missing, mismatched and unused translation keys';

    public function handle(): int
    {
        $english = $this->load('en');
        if ($english === []) {
            $this->error('lang/en has no keys.');

            return self::FAILURE;
        }

        $problems = 0;

        foreach (array_keys(User::LOCALES) as $locale) {
            if ($locale === 'en') {
                continue;
            }
            $other = $this->load($locale);

            foreach (array_diff_key($english, $other) as $key => $_) {
                $this->line("[$locale] missing: $key");
                $problems++;
            }
            foreach (array_diff_key($other, $english) as $key => $_) {
                $this->line("[$locale] not in en: $key");
                $problems++;
            }
            foreach (array_intersect_key($english, $other) as $key => $text) {
                if ($this->placeholders($text) !== $this->placeholders($other[$key])) {
                    $this->line("[$locale] placeholders differ: $key");
                    $problems++;
                }
            }
        }

        $used = $this->usedKeys();
        foreach ($this->webClientKeys() as $key) {
            $used[] = $key;
            if (! isset($english[$key])) {
                $this->line("used by the web client but not defined: $key");
                $problems++;
            }
        }
        foreach ($used as $key) {
            // A literal ending in "_" is a prefix completed at runtime (devices.col_ + column).
            if (! str_ends_with($key, '_') && ! isset($english[$key])) {
                $this->line("used but not defined: $key");
                $problems++;
            }
        }
        foreach (array_keys($english) as $key) {
            if (! in_array($key, $used, true) && ! $this->isDynamic($key)) {
                $this->line("unused: $key");
                $problems++;
            }
        }

        if ($problems === 0) {
            $this->info(count($english).' keys, '.count(User::LOCALES).' languages, no drift.');

            return self::SUCCESS;
        }

        $this->error("$problems problem(s).");

        return self::FAILURE;
    }

    /**
     * Keys looked up at runtime rather than written out in code: Laravel's
     * validation messages, Label::get() names (labels.*), the device column
     * headers ('devices.col_'.$column), the diagnostics status badges and the
     * web client's strings (webclient.*, looked up from TypeScript).
     */
    private function isDynamic(string $key): bool
    {
        foreach (['validation.', 'labels.', 'devices.col_', 'diagnostics.status_', 'webclient.'] as $prefix) {
            if (str_starts_with($key, $prefix)) {
                return true;
            }
        }

        return false;
    }

    /** @return array<string, string> "file.key" => text, for one locale. */
    private function load(string $locale): array
    {
        $out = [];
        foreach (glob(lang_path($locale.'/*.php')) ?: [] as $file) {
            $ns = basename($file, '.php');
            foreach (Arr::dot((array) require $file) as $key => $text) {
                // Arr::dot() keeps empty arrays (validation.custom) as leaves.
                if (is_string($text)) {
                    $out["$ns.$key"] = $text;
                }
            }
        }

        return $out;
    }

    /** @return list<string> */
    private function placeholders(string $text): array
    {
        preg_match_all('/(?<![A-Za-z0-9]):[a-z_]+/i', $text, $m);
        $found = array_unique($m[0]);
        sort($found);

        return $found;
    }

    /** @return list<string> Every literal key passed straight to __() or trans_choice(). */
    private function usedKeys(): array
    {
        $keys = [];
        foreach ([resource_path('views'), app_path()] as $dir) {
            $iterator = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS));
            foreach ($iterator as $file) {
                if ($file->getExtension() !== 'php') {
                    continue;
                }
                if (preg_match_all("/\b(?:__|trans_choice)\(\s*'([a-z0-9_]+\.[a-z0-9_]+)'/", file_get_contents($file->getPathname()), $m)) {
                    array_push($keys, ...$m[1]);
                }
            }
        }

        return array_values(array_unique($keys));
    }

    /** @return list<string> "webclient.key" for every tl('key') / tn('key') call in webclient/src. */
    private function webClientKeys(): array
    {
        $dir = base_path('webclient/src');
        if (! is_dir($dir)) {
            return [];
        }

        $keys = [];
        $iterator = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS));
        foreach ($iterator as $file) {
            if ($file->getExtension() !== 'ts') {
                continue;
            }
            if (preg_match_all("/\bt[ln]\(\s*'([a-z0-9_]+)'/", file_get_contents($file->getPathname()), $m)) {
                foreach ($m[1] as $key) {
                    $keys[] = 'webclient.'.$key;
                }
            }
        }

        return array_values(array_unique($keys));
    }
}
