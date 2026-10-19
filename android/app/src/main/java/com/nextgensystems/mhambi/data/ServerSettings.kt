package com.nextgensystems.mhambi.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.nextgensystems.mhambi.BuildConfig
import com.nextgensystems.mhambi.engine.Logic
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.runBlocking

private val Context.settingsStore by preferencesDataStore(name = "mhambi_settings")

/** Persistent app settings: the server address (changeable without rebuilding) and the chosen theme. Both survive restarts. */
class ServerSettings(private val context: Context) {
    private val keyUrl = stringPreferencesKey("api_base_url")
    private val keyTheme = stringPreferencesKey("theme")

    @Volatile
    var baseUrl: String = BuildConfig.API_BASE_URL
        private set

    val themeFlow: Flow<String> = context.settingsStore.data.map { it[keyTheme] ?: "light" }

    init {
        val saved = runBlocking { context.settingsStore.data.first()[keyUrl] }
        if (!saved.isNullOrBlank()) baseUrl = saved
    }

    /** Returns false when [input] is not a usable address. */
    suspend fun setBaseUrl(input: String): Boolean {
        val normalised = Logic.normalizeBaseUrl(input) ?: return false
        context.settingsStore.edit { it[keyUrl] = normalised }
        baseUrl = normalised
        return true
    }

    suspend fun setTheme(theme: String) {
        context.settingsStore.edit { it[keyTheme] = theme }
    }
}
