package com.musicbox.app.discord

import com.discord.socialsdk.DiscordSocialSdkInit
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class DiscordPresenceModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  companion object {
    private const val APPLICATION_ID = 1550247896803446874L

    init {
      System.loadLibrary("f4we_discord_presence")
    }
  }

  private var initialized = false

  override fun getName(): String = "DiscordPresence"

  private fun initialize(): Boolean {
    if (initialized) return true
    val activity = currentActivity ?: return false
    DiscordSocialSdkInit.setEngineActivity(activity)
    initialized = nativeInitialize(APPLICATION_ID)
    return initialized
  }

  @ReactMethod
  fun updateActivity(
    title: String,
    artist: String,
    startTimestampSeconds: Double,
    endTimestampSeconds: Double,
    promise: Promise
  ) {
    try {
      if (!initialize()) {
        promise.resolve(false)
        return
      }
      promise.resolve(
        nativeUpdateActivity(
          title,
          artist,
          startTimestampSeconds.toLong(),
          endTimestampSeconds.toLong()
        )
      )
    } catch (error: Throwable) {
      promise.reject("DISCORD_ACTIVITY_UPDATE_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun clearActivity(promise: Promise) {
    try {
      if (initialized) nativeClearActivity()
      promise.resolve(true)
    } catch (error: Throwable) {
      promise.reject("DISCORD_ACTIVITY_CLEAR_FAILED", error.message, error)
    }
  }

  override fun invalidate() {
    if (initialized) {
      nativeShutdown()
      initialized = false
    }
    super.invalidate()
  }

  private external fun nativeInitialize(applicationId: Long): Boolean
  private external fun nativeUpdateActivity(
    title: String,
    artist: String,
    startTimestampSeconds: Long,
    endTimestampSeconds: Long
  ): Boolean
  private external fun nativeClearActivity()
  private external fun nativeShutdown()
}
