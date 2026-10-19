package com.nextgensystems.mhambi.data

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.google.gson.Gson

/**
 * Keeps the access/refresh tokens in EncryptedSharedPreferences (Android Keystore backed).
 * Passwords are never stored. If the device keystore is unusable (seen on some emulators), the session is kept in memory only.
 */
class SessionStore(private val context: Context) {
    private val gson = Gson()
    private var memory: StoredSession? = null
    private val prefs: SharedPreferences? = openPrefs()

    private fun openPrefs(): SharedPreferences? {
        fun create(): SharedPreferences {
            val key = MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
            return EncryptedSharedPreferences.create(
                context, FILE, key,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        }
        return try {
            create()
        } catch (first: Exception) {
            Log.w(TAG, "Encrypted storage failed, resetting once: ${first.javaClass.simpleName}")
            try {
                context.deleteSharedPreferences(FILE)
                create()
            } catch (second: Exception) {
                Log.w(TAG, "Encrypted storage unavailable; session will only be kept in memory")
                null
            }
        }
    }

    @Synchronized
    fun load(): StoredSession? {
        memory?.let { return it }
        val json = prefs?.getString(KEY, null) ?: return null
        return try {
            gson.fromJson(json, StoredSession::class.java)?.also { memory = it }
        } catch (e: Exception) {
            null
        }
    }

    @Synchronized
    fun save(session: StoredSession) {
        memory = session
        prefs?.edit()?.putString(KEY, gson.toJson(session))?.apply()
    }

    @Synchronized
    fun clear() {
        memory = null
        prefs?.edit()?.clear()?.apply()
    }

    private companion object {
        const val FILE = "mhambi_session"
        const val KEY = "session"
        const val TAG = "SessionStore"
    }
}
