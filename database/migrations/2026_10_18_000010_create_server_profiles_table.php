<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Named ID/relay server presets for the in-browser web client, kept per user
 * so they follow the account to any browser. Like the desktop client's server
 * settings, every address is optional: an empty ID server means RustDesk's
 * public server, an empty relay means "same host as the ID server" and an empty
 * key means RustDesk's public key. The console's own server stays the built-in
 * default and is not stored here.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('server_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name', 64);
            $table->string('id_server', 255)->nullable();
            $table->string('relay_server', 255)->nullable();
            $table->string('server_key', 255)->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'name']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('server_profiles');
    }
};
