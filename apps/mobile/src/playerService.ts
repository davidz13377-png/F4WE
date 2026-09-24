import TrackPlayer, { Event } from "react-native-track-player";

export async function playbackService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteNext, () => TrackPlayer.skipToNext());
  TrackPlayer.addEventListener(Event.RemotePrevious, () => TrackPlayer.skipToPrevious());
  TrackPlayer.addEventListener(Event.RemoteSeek, event => TrackPlayer.seekTo(event.position));
  // Android does not automatically replace embedded MP3 tags with our queue
  // metadata. Refresh it in the headless service too, so notification controls
  // stay correct while the app is in the background or the track ends itself.
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, event => {
    if (!event.track) return;
    void TrackPlayer.updateNowPlayingMetadata({
      title: event.track.title || "F4WE",
      artist: event.track.artist || "Unknown artist",
      album: "F4WE", description: "F4WE", genre: "F4WE",
      artwork: event.track.artwork
    });
  });
}
