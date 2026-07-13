import Foundation
import AVFoundation

@objc(VideoEffectsBridge)
class VideoEffectsBridge: NSObject {

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc
  func showVideoEffectsUI() {
    if #available(iOS 15.4, *) {
      DispatchQueue.main.async {
        AVCaptureDevice.showSystemUserInterface(.videoEffects)
      }
    }
  }
}