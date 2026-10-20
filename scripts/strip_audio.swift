// Coral Auto Spa — remove the audio track from a video.
//
// avconvert, which does the rest of the video pipeline, has no way to drop
// audio. This builds a composition containing only the video track and exports
// it passthrough, so the video is copied rather than re-encoded: no quality
// loss, no waiting, and the audio simply is not carried over.
//
// usage: strip_audio <input.mp4> <output.mp4>

import AVFoundation
import Foundation

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write("usage: strip_audio <in> <out>\n".data(using: .utf8)!)
    exit(2)
}

let src = URL(fileURLWithPath: args[1])
let dst = URL(fileURLWithPath: args[2])
try? FileManager.default.removeItem(at: dst)

let asset = AVURLAsset(url: src)
let composition = AVMutableComposition()

guard let sourceVideo = asset.tracks(withMediaType: .video).first else {
    FileHandle.standardError.write("no video track\n".data(using: .utf8)!)
    exit(3)
}
guard let track = composition.addMutableTrack(withMediaType: .video,
                                              preferredTrackID: kCMPersistentTrackID_Invalid) else {
    exit(3)
}

do {
    try track.insertTimeRange(CMTimeRange(start: .zero, duration: asset.duration),
                              of: sourceVideo, at: .zero)
} catch {
    FileHandle.standardError.write("insert failed: \(error)\n".data(using: .utf8)!)
    exit(4)
}

// Without this the clips come out landscape: the rotation lives in the
// source track's transform, not in the pixels.
track.preferredTransform = sourceVideo.preferredTransform

guard let export = AVAssetExportSession(asset: composition,
                                        presetName: AVAssetExportPresetPassthrough) else {
    exit(5)
}
export.outputURL = dst
export.outputFileType = .mp4
export.shouldOptimizeForNetworkUse = true   // keep the moov atom at the front

let done = DispatchSemaphore(value: 0)
export.exportAsynchronously { done.signal() }
done.wait()

if export.status != .completed {
    let message = export.error?.localizedDescription ?? "unknown error"
    FileHandle.standardError.write("export failed: \(message)\n".data(using: .utf8)!)
    exit(6)
}
