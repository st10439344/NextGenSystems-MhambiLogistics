package com.nextgensystems.mhambi

import android.app.Application

class MhambiApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Graph.init(this)
    }
}
