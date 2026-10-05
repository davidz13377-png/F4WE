#include <jni.h>

#include <android/log.h>
#include <atomic>
#include <chrono>
#include <cstdint>
#include <mutex>
#include <string>
#include <thread>

#include <cdiscord.h>

namespace {
constexpr char kLogTag[] = "F4WEDiscordPresence";
constexpr char kWebsite[] = "https://f4we.xyz/";

std::mutex gMutex;
Discord_Client gClient{};
bool gInitialized = false;
std::atomic<bool> gPumpRunning{false};
std::thread gPumpThread;

std::string fromJString(JNIEnv* env, jstring value) {
  if (!value) return {};
  const char* characters = env->GetStringUTFChars(value, nullptr);
  if (!characters) return {};
  std::string result(characters);
  env->ReleaseStringUTFChars(value, characters);
  return result;
}

std::string truncateUtf8(std::string value, std::size_t maximumBytes = 128) {
  if (value.size() <= maximumBytes) return value;
  value.resize(maximumBytes);
  while (!value.empty() && (static_cast<unsigned char>(value.back()) & 0xC0) == 0x80) {
    value.pop_back();
  }
  return value;
}

Discord_String discordString(std::string& value) {
  return {reinterpret_cast<uint8_t*>(value.data()), value.size()};
}

void resultCallback(Discord_ClientResult*, void*) {}

void startCallbackPump() {
  if (gPumpRunning.exchange(true)) return;
  gPumpThread = std::thread([] {
    while (gPumpRunning.load()) {
      {
        std::lock_guard<std::mutex> lock(gMutex);
        if (gInitialized) Discord_RunCallbacks();
      }
      std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
  });
}

void stopCallbackPump() {
  if (!gPumpRunning.exchange(false)) return;
  if (gPumpThread.joinable()) gPumpThread.join();
}
}  // namespace

extern "C" JNIEXPORT jboolean JNICALL
Java_com_musicbox_app_discord_DiscordPresenceModule_nativeInitialize(
    JNIEnv*, jobject, jlong applicationId) {
  std::lock_guard<std::mutex> lock(gMutex);
  if (!gInitialized) {
    Discord_Client_Init(&gClient);
    gInitialized = true;
  }
  Discord_Client_SetApplicationId(&gClient, static_cast<uint64_t>(applicationId));
  startCallbackPump();
  __android_log_print(ANDROID_LOG_INFO, kLogTag, "Discord Rich Presence initialized");
  return JNI_TRUE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_musicbox_app_discord_DiscordPresenceModule_nativeUpdateActivity(
    JNIEnv* env,
    jobject,
    jstring titleValue,
    jstring artistValue,
    jlong startTimestamp,
    jlong endTimestamp) {
  std::lock_guard<std::mutex> lock(gMutex);
  if (!gInitialized) return JNI_FALSE;

  std::string title = truncateUtf8(fromJString(env, titleValue));
  std::string artist = truncateUtf8(fromJString(env, artistValue));
  std::string buttonLabel = "Try F4WE";
  std::string buttonUrl = kWebsite;

  if (title.size() < 2) title = "F4WE Music";
  if (artist.size() < 2) artist = "Unknown artist";

  Discord_Activity activity{};
  Discord_Activity_Init(&activity);
  // Discord's game/app Rich Presence supports the Playing activity reliably.
  // The song and artist below make it clear that the user is listening in F4WE.
  Discord_Activity_SetType(&activity, Discord_ActivityTypes_Playing);
  Discord_StatusDisplayTypes displayType = Discord_StatusDisplayTypes_Details;
  Discord_Activity_SetStatusDisplayType(&activity, &displayType);

  auto titleString = discordString(title);
  auto artistString = discordString(artist);
  Discord_Activity_SetDetails(&activity, &titleString);
  Discord_Activity_SetState(&activity, &artistString);

  Discord_ActivityTimestamps timestamps{};
  Discord_ActivityTimestamps_Init(&timestamps);
  if (startTimestamp > 0) {
    Discord_ActivityTimestamps_SetStart(&timestamps, static_cast<uint64_t>(startTimestamp));
  }
  if (endTimestamp > startTimestamp) {
    Discord_ActivityTimestamps_SetEnd(&timestamps, static_cast<uint64_t>(endTimestamp));
  }
  Discord_Activity_SetTimestamps(&activity, &timestamps);

  Discord_ActivityButton button{};
  Discord_ActivityButton_Init(&button);
  auto labelString = discordString(buttonLabel);
  auto urlString = discordString(buttonUrl);
  Discord_ActivityButton_SetLabel(&button, labelString);
  Discord_ActivityButton_SetUrl(&button, urlString);
  Discord_Activity_AddButton(&activity, &button);

  Discord_Client_UpdateRichPresence(
      &gClient, &activity, resultCallback, nullptr, nullptr);

  Discord_ActivityButton_Drop(&button);
  Discord_ActivityTimestamps_Drop(&timestamps);
  Discord_Activity_Drop(&activity);
  return JNI_TRUE;
}

extern "C" JNIEXPORT void JNICALL
Java_com_musicbox_app_discord_DiscordPresenceModule_nativeClearActivity(
    JNIEnv*, jobject) {
  std::lock_guard<std::mutex> lock(gMutex);
  if (gInitialized) Discord_Client_ClearRichPresence(&gClient);
}

extern "C" JNIEXPORT void JNICALL
Java_com_musicbox_app_discord_DiscordPresenceModule_nativeShutdown(
    JNIEnv*, jobject) {
  stopCallbackPump();
  std::lock_guard<std::mutex> lock(gMutex);
  if (!gInitialized) return;
  Discord_Client_ClearRichPresence(&gClient);
  Discord_Client_Drop(&gClient);
  gInitialized = false;
}
