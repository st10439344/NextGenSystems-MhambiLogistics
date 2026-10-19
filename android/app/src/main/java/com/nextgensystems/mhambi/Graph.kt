package com.nextgensystems.mhambi

import android.content.Context
import com.nextgensystems.mhambi.data.ApiClient
import com.nextgensystems.mhambi.data.AuthRepository
import com.nextgensystems.mhambi.data.ServerSettings
import com.nextgensystems.mhambi.data.SessionStore
import com.nextgensystems.mhambi.engine.PortalConfig
import java.io.File

/** Simple service locator (no dependency-injection framework needed for an app this size). */
object Graph {
    lateinit var session: SessionStore
        private set
    lateinit var settings: ServerSettings
        private set
    lateinit var api: ApiClient
        private set
    lateinit var auth: AuthRepository
        private set
    lateinit var config: PortalConfig
        private set

    fun init(context: Context) {
        val app = context.applicationContext
        session = SessionStore(app)
        settings = ServerSettings(app)
        api = ApiClient(session, settings, File(app.cacheDir, "downloads"))
        auth = AuthRepository(api, session)
        config = app.assets.open("portal-config.json").bufferedReader().use { PortalConfig.parse(it.readText()) }
    }
}
