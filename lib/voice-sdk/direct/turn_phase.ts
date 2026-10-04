/**
 * TurnPhase State Machine (Vocom Reactor Compile-Time Pattern)
 * Coordinates user speech onset, barge-in policies, thinking pauses, and output gates.
 */

export type TurnPhaseState =
  | { type: "Listening" }
  | { type: "UserSpeaking"; pipelineWasActive: boolean }
  | { type: "WaitingForTranscript" }
  | { type: "EotFallback" }
  | { type: "BargeInWordCount" }
  | { type: "Speaking" };

export type TurnEvent =
  | { type: "SpeechStarted"; pipelineWasActive: boolean }
  | { type: "SpeechEnded"; smartComplete: boolean }
  | { type: "Transcript"; text: string; isFinal: boolean }
  | { type: "FallbackTimerFired" }
  | { type: "GenerationComplete" }
  | { type: "Error" };

export type TurnAction =
  | { type: "None" }
  | { type: "InterruptTts" }
  | { type: "CommitBargeIn"; text: string }
  | { type: "RejectNoise" }
  | { type: "StartLlm"; text: string }
  | { type: "ArmFallbackTimer"; timeoutMs: number }
  | { type: "CancelFallbackTimer" };

export class TurnPhaseStateMachine {
  private state: TurnPhaseState = { type: "Listening" };
  private minBargeInWords: number = 1;

  constructor(minBargeInWords: number = 1) {
    this.minBargeInWords = minBargeInWords;
  }

  public getState(): TurnPhaseState {
    return this.state;
  }

  public transition(event: TurnEvent): TurnAction {
    switch (this.state.type) {
      case "Listening": {
        if (event.type === "SpeechStarted") {
          this.state = { type: "UserSpeaking", pipelineWasActive: event.pipelineWasActive };
          if (event.pipelineWasActive) {
            return { type: "InterruptTts" };
          }
          return { type: "None" };
        }
        if (event.type === "Transcript" && event.isFinal && event.text.trim().length > 0) {
          this.state = { type: "Speaking" };
          return { type: "StartLlm", text: event.text.trim() };
        }
        break;
      }

      case "Speaking": {
        if (event.type === "SpeechStarted") {
          this.state = { type: "UserSpeaking", pipelineWasActive: true };
          return { type: "InterruptTts" };
        }
        if (event.type === "GenerationComplete") {
          this.state = { type: "Listening" };
          return { type: "None" };
        }
        if (event.type === "Transcript" && event.text.trim().length > 0) {
          this.state = { type: "Speaking" };
          return { type: "StartLlm", text: event.text.trim() };
        }
        break;
      }

      case "UserSpeaking": {
        if (event.type === "Transcript" && event.text.trim().length > 0) {
          this.state = { type: "Speaking" };
          return { type: "StartLlm", text: event.text.trim() };
        }
        if (event.type === "SpeechEnded") {
          if (this.state.pipelineWasActive) {
            this.state = { type: "BargeInWordCount" };
            return { type: "None" };
          }

          if (event.smartComplete) {
            this.state = { type: "WaitingForTranscript" };
            return { type: "None" };
          } else {
            this.state = { type: "EotFallback" };
            return { type: "ArmFallbackTimer", timeoutMs: 1200 };
          }
        }
        break;
      }

      case "BargeInWordCount": {
        if (event.type === "Transcript") {
          const wordCount = event.text.trim().split(/\s+/).filter(Boolean).length;
          if (wordCount >= this.minBargeInWords) {
            this.state = { type: "Speaking" };
            return { type: "CommitBargeIn", text: event.text.trim() };
          } else {
            this.state = { type: "Listening" };
            return { type: "RejectNoise" };
          }
        }
        if (event.type === "SpeechStarted") {
          this.state = { type: "UserSpeaking", pipelineWasActive: true };
          return { type: "None" };
        }
        break;
      }

      case "EotFallback": {
        if (event.type === "Transcript" && event.text.trim().length > 0) {
          this.state = { type: "Speaking" };
          return { type: "StartLlm", text: event.text.trim() };
        }
        if (event.type === "SpeechStarted") {
          this.state = { type: "UserSpeaking", pipelineWasActive: false };
          return { type: "CancelFallbackTimer" };
        }
        if (event.type === "FallbackTimerFired") {
          this.state = { type: "WaitingForTranscript" };
          return { type: "CancelFallbackTimer" };
        }
        break;
      }

      case "WaitingForTranscript": {
        if (event.type === "Transcript" && event.text.trim().length > 0) {
          this.state = { type: "Speaking" };
          return { type: "StartLlm", text: event.text.trim() };
        }
        if (event.type === "SpeechStarted") {
          this.state = { type: "UserSpeaking", pipelineWasActive: false };
          return { type: "None" };
        }
        break;
      }
    }

    if (event.type === "GenerationComplete") {
      this.state = { type: "Listening" };
      return { type: "None" };
    }

    if (event.type === "Transcript" && event.text.trim().length > 0) {
      this.state = { type: "Speaking" };
      return { type: "StartLlm", text: event.text.trim() };
    }

    return { type: "None" };
  }

  public reset(): void {
    this.state = { type: "Listening" };
  }
}