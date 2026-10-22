import { CallMediaType } from "@zapo-js/voip";

export function shouldLoadIncomingCallAudio(call) {
  return call?.mediaType === CallMediaType.Audio;
}
