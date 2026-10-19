package com.nextgensystems.mhambi.data

import com.google.gson.Gson
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Streaming
import retrofit2.http.Url
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Retrofit interface with absolute URLs, so the server address can change at run time. */
interface RawApi {
    @GET suspend fun get(@Url url: String, @Header("Authorization") auth: String?): Response<ResponseBody>
    @POST suspend fun post(@Url url: String, @Header("Authorization") auth: String?, @Body body: RequestBody): Response<ResponseBody>
    @PUT suspend fun put(@Url url: String, @Header("Authorization") auth: String?, @Body body: RequestBody): Response<ResponseBody>
    @PATCH suspend fun patch(@Url url: String, @Header("Authorization") auth: String?, @Body body: RequestBody): Response<ResponseBody>
    @HTTP(method = "DELETE", hasBody = false) suspend fun delete(@Url url: String, @Header("Authorization") auth: String?): Response<ResponseBody>
    @Streaming @GET suspend fun download(@Url url: String, @Header("Authorization") auth: String?): Response<ResponseBody>
}

/**
 * Talks to the shared Mhambi REST API. Adds the bearer token, refreshes it once on 401 (rotating refresh token),
 * and turns every failure into an [ApiException] with a message a person can act on.
 */
class ApiClient(
    private val session: SessionStore,
    private val settings: ServerSettings,
    private val downloadDir: File
) {
    private val gson = Gson()
    private val http = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()
    private val api: RawApi = Retrofit.Builder().baseUrl("http://localhost/").client(http).build().create(RawApi::class.java)
    private val refreshLock = Mutex()
    private val expired = MutableSharedFlow<Unit>(extraBufferCapacity = 1)

    /** Emits when the session can no longer be refreshed and the person must sign in again. */
    val sessionExpired: SharedFlow<Unit> = expired

    fun url(path: String): String = settings.baseUrl.trimEnd('/') + (if (path.startsWith("/")) path else "/$path")

    suspend fun request(method: String, path: String, body: JsonObject? = null, auth: Boolean = true): JsonElement =
        withContext(Dispatchers.IO) {
            val resp = execRaw(method, path, body, auth, true)
            val text = (if (resp.isSuccessful) resp.body()?.string() else resp.errorBody()?.string()) ?: ""
            if (!resp.isSuccessful) throw parseError(resp.code(), text)
            if (text.isBlank()) JsonObject() else JsonParser.parseString(text)
        }

    /** Downloads an authorised file into the app cache and returns it. */
    suspend fun download(path: String, fileName: String): File = withContext(Dispatchers.IO) {
        val resp = execRaw("DOWNLOAD", path, null, true, true)
        if (!resp.isSuccessful) throw parseError(resp.code(), resp.errorBody()?.string() ?: "")
        downloadDir.mkdirs()
        val safe = fileName.replace(Regex("[^A-Za-z0-9._-]"), "_").ifBlank { "download" }
        val file = File(downloadDir, safe)
        val bodyStream = resp.body() ?: throw ApiException(resp.code(), "EMPTY", "The server sent an empty file.")
        try {
            bodyStream.byteStream().use { input -> file.outputStream().use { out -> input.copyTo(out) } }
        } catch (e: IOException) {
            throw ApiException(0, "NETWORK", "The download was interrupted. Check your connection and try again.")
        }
        file
    }

    private suspend fun execRaw(method: String, path: String, body: JsonObject?, auth: Boolean, canRetry: Boolean): Response<ResponseBody> {
        val token = if (auth) session.load()?.accessToken else null
        val resp = send(method, url(path), body, token)
        if (resp.code() == 401 && auth && canRetry && session.load()?.refreshToken != null) {
            if (refresh(token)) return execRaw(method, path, body, auth, false)
            session.clear()
            expired.tryEmit(Unit)
            throw ApiException(401, "SESSION_EXPIRED", "Your session has expired. Please sign in again.")
        }
        return resp
    }

    private suspend fun send(method: String, url: String, body: JsonObject?, token: String?): Response<ResponseBody> {
        val bearer = token?.let { "Bearer $it" }
        val json = (body ?: JsonObject()).toString().toRequestBody("application/json".toMediaType())
        return try {
            when (method.uppercase()) {
                "GET" -> api.get(url, bearer)
                "POST" -> api.post(url, bearer, json)
                "PUT" -> api.put(url, bearer, json)
                "PATCH" -> api.patch(url, bearer, json)
                "DELETE" -> api.delete(url, bearer)
                "DOWNLOAD" -> api.download(url, bearer)
                else -> throw ApiException(0, "BAD_METHOD", "Unsupported request type: $method")
            }
        } catch (e: IOException) {
            throw ApiException(0, "NETWORK", "Cannot reach the server. Check your internet connection and the server address (Server settings on the sign-in screen).")
        } catch (e: IllegalArgumentException) {
            throw ApiException(0, "BAD_URL", "The server address is not valid. Open Server settings on the sign-in screen and correct it.")
        }
    }

    /** Returns true if a fresh token pair is now stored (by us or by a concurrent refresh). */
    private suspend fun refresh(oldAccess: String?): Boolean {
        return refreshLock.withLock {
            val current = session.load() ?: return@withLock false
            if (current.accessToken != oldAccess) return@withLock true
            val payload = JsonObject().apply { addProperty("refreshToken", current.refreshToken) }
            val resp = send("POST", url("/auth/refresh"), payload, null)
            if (!resp.isSuccessful) return@withLock false
            val text = resp.body()?.string() ?: return@withLock false
            val auth = gson.fromJson(text, AuthResponse::class.java)
            session.save(StoredSession(auth.accessToken, auth.refreshToken, auth.user))
            true
        }
    }

    fun parseError(status: Int, text: String): ApiException {
        return try {
            val err = JsonParser.parseString(text).asJsonObject.getAsJsonObject("error")
            val details = err.getAsJsonArray("details")?.map {
                val o = it.asJsonObject
                FieldError(o.get("field")?.asString, o.get("message")?.asString)
            }
            ApiException(status, err.get("code")?.asString ?: "ERROR", err.get("message")?.asString ?: "Request failed ($status).", details)
        } catch (e: Exception) {
            ApiException(status, "ERROR", "The server returned an unexpected response ($status).")
        }
    }
}
