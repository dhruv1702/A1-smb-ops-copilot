"use client";

import { useId, useRef, useState } from "react";

declare global {
  interface Window {
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
    SpeechRecognition?: SpeechRecognitionConstructor;
  }
}

interface SpeechRecognitionEventLike extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}

export interface QueuedInputFile {
  id: string;
  name: string;
  sizeLabel: string;
  text?: string;
  mimeType?: string;
  isDemo?: boolean;
}

interface UploadBoxProps {
  queuedFiles: QueuedInputFile[];
  pastedText: string;
  voiceTranscript: string;
  onFilesChange: (files: QueuedInputFile[]) => void;
  onPastedTextChange: (value: string) => void;
  onVoiceTranscriptChange: (value: string) => void;
  onRun: () => void;
  onLoadDemo: () => void;
  isRunning: boolean;
}

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadBox({
  queuedFiles,
  pastedText,
  voiceTranscript,
  onFilesChange,
  onPastedTextChange,
  onVoiceTranscriptChange,
  onRun,
  onLoadDemo,
  isRunning,
}: UploadBoxProps) {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [micMessage, setMicMessage] = useState("Optional voice note");

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const addFiles = async (incomingFiles: FileList | File[]) => {
    const nextFiles = await Promise.all(
      Array.from(incomingFiles).map(async (file, index) => ({
        id: `${file.name}-${file.lastModified}-${index}`,
        name: file.name,
        sizeLabel: formatFileSize(file.size),
        text: await file.text(),
        mimeType: file.type || "text/plain",
      })),
    );

    onFilesChange(nextFiles);
  };

  const handleMic = () => {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setMicMessage("Speech input is not available in this browser.");
      return;
    }

    if (isRecording && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();

      if (transcript) {
        onVoiceTranscriptChange(transcript);
        setMicMessage("Voice note captured for review.");
      }
    };
    recognition.onerror = () => {
      setMicMessage("Voice input could not be captured. You can still type or paste.");
    };
    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    setMicMessage("Listening...");
  };

  const hasInputs =
    queuedFiles.length > 0 || pastedText.trim().length > 0 || voiceTranscript.trim().length > 0;

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="kicker">Intake</p>
          <h2>Run a daily brief</h2>
        </div>
        <button className="button button-secondary" type="button" onClick={onLoadDemo}>
          Load demo inputs
        </button>
      </div>

      <div className="intake-grid">
        <div className="telegram-placeholder">
          <div>
            <p className="kicker">Future input channel</p>
            <h3>Telegram bot placeholder</h3>
          </div>
          <p className="helper-copy">
            This can also be triggered from a Telegram bot that gathers owner messages, email pulls,
            and other business inputs before preparing the same reviewable brief.
          </p>
        </div>

        <div
          className={`upload-zone${isDragging ? " drag-active" : ""}`}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setIsDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            if (event.dataTransfer.files.length > 0) {
              void addFiles(event.dataTransfer.files);
            }
          }}
        >
          <input
            id={inputId}
            ref={fileInputRef}
            type="file"
            multiple
            onChange={(event) => {
              if (event.target.files) {
                void addFiles(event.target.files);
              }
            }}
          />
          <div className="input-actions">
            <label className="upload-trigger" htmlFor={inputId}>
              Upload files
            </label>
            <span className="upload-note">
              Drop notes, invoices, exports, or demo files here to prepare the brief.
            </span>
          </div>

          {queuedFiles.length > 0 ? (
            <div className="upload-list">
              {queuedFiles.map((file) => (
                <div className="upload-item" key={file.id}>
                  <strong>{file.name}</strong>
                  <span>{file.sizeLabel}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div>
          <div className="panel-head">
            <div>
              <p className="kicker">Paste text</p>
              <h3>Notes or copied messages</h3>
            </div>
          </div>
          <textarea
            className="paste-box"
            placeholder="Paste a customer email, founder note, invoice summary, or operating context."
            value={pastedText}
            onChange={(event) => onPastedTextChange(event.target.value)}
          />
        </div>

        <div>
          <div className="panel-head">
            <div>
              <p className="kicker">Voice input</p>
              <h3>Optional voice note</h3>
            </div>
          </div>
          <div className="mic-row">
            <button className="button button-outline" type="button" onClick={handleMic}>
              {isRecording ? "Stop listening" : "Use microphone"}
            </button>
            <span className="helper-copy">{micMessage}</span>
          </div>
          <textarea
            className="paste-box"
            placeholder="Voice transcript will appear here for review."
            value={voiceTranscript}
            onChange={(event) => onVoiceTranscriptChange(event.target.value)}
          />
        </div>

        <div className="run-row">
          <button className="button button-primary" type="button" onClick={onRun} disabled={isRunning}>
            {isRunning ? "Preparing brief..." : "Run Daily Brief"}
          </button>
          <span className="helper-copy">
            The output stays reviewable and does not imply anything was sent or updated automatically.
          </span>
        </div>

        {!hasInputs ? (
          <div className="helper-copy">
            Add demo files, paste text, or capture a short voice note to run the prototype.
          </div>
        ) : null}
      </div>
    </section>
  );
}
