import { useState, useEffect, useRef } from "react";

const STORAGE_KEY = "ay_gate_unlocked";
const PASSWORD = "anything is possible";

interface PasswordGateProps {
  children: React.ReactNode;
}

export function PasswordGate({ children }: PasswordGateProps) {
  const [unlocked, setUnlocked] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const [shaking, setShaking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (sessionStorage.getItem(STORAGE_KEY) === "1") {
      setUnlocked(true);
    } else {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, []);

  const attempt = () => {
    if (value.trim().toLowerCase() === PASSWORD) {
      sessionStorage.setItem(STORAGE_KEY, "1");
      setError(false);
      setUnlocked(true);
    } else {
      setError(true);
      setShaking(true);
      setValue("");
      setTimeout(() => {
        setShaking(false);
        inputRef.current?.focus();
      }, 600);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") attempt();
    if (error) setError(false);
  };

  if (unlocked) return <>{children}</>;

  return (
    <div style={styles.overlay}>
      <div style={styles.backdrop} />
      <div
        style={{
          ...styles.card,
          animation: shaking ? "ay-shake 0.5s ease" : "ay-fade-in 0.4s ease",
        }}
      >
        <p style={styles.subheading}>Enter passphrase to continue</p>

        <div style={styles.inputWrapper}>
          <input
            ref={inputRef}
            type="password"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(false);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Passphrase"
            autoComplete="off"
            style={{
              ...styles.input,
              ...(error ? styles.inputError : {}),
            }}
          />
          {error && <p style={styles.errorMsg}>Incorrect passphrase. Try again.</p>}
        </div>

        <button onClick={attempt} style={styles.button}>
          <span>Unlock</span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M3 8H13M9 4L13 8L9 12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <style>{`
        @keyframes ay-fade-in {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes ay-shake {
          0%, 100% { transform: translateX(0); }
          15%       { transform: translateX(-8px); }
          30%       { transform: translateX(8px); }
          45%       { transform: translateX(-6px); }
          60%       { transform: translateX(6px); }
          75%       { transform: translateX(-3px); }
          90%       { transform: translateX(3px); }
        }
        #ay-gate-input:focus {
          outline: none;
          border-color: rgba(255, 255, 255, 0.4);
          box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.1);
        }
        #ay-gate-btn:hover {
          background: #2a2a2a;
          transform: translateY(-1px);
        }
        #ay-gate-btn:active {
          transform: translateY(0);
        }
      `}</style>
    </div>
  );
}

/* ─── inline styles ──────────────────────────────────────────── */
const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    padding: "1rem",
  },
  backdrop: {
    position: "absolute",
    inset: 0,
    background: "#0a0a0a",
  },
  card: {
    position: "relative",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.1)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    borderRadius: "16px",
    padding: "2.5rem 2rem",
    width: "100%",
    maxWidth: "400px",
    display: "flex",
    flexDirection: "column",
    gap: "0",
    boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
  },

  heading: {
    fontSize: "1.5rem",
    fontWeight: 700,
    color: "#fff",
    margin: "0 0 0.375rem 0",
    letterSpacing: "-0.03em",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  subheading: {
    fontSize: "0.875rem",
    color: "rgba(255,255,255,0.4)",
    margin: "0 0 1.75rem 0",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  inputWrapper: {
    marginBottom: "1rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  input: {
    width: "100%",
    padding: "0.75rem 1rem",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "10px",
    color: "#fff",
    fontSize: "0.9375rem",
    fontFamily: "system-ui, -apple-system, sans-serif",
    transition: "border-color 0.2s, box-shadow 0.2s",
    outline: "none",
  },
  inputError: {
    borderColor: "rgba(239,68,68,0.6)",
    boxShadow: "0 0 0 3px rgba(239,68,68,0.12)",
  },
  errorMsg: {
    fontSize: "0.8125rem",
    color: "#f87171",
    margin: 0,
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  button: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    width: "100%",
    padding: "0.75rem 1rem",
    background: "#171717",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px",
    color: "#fff",
    fontSize: "0.9375rem",
    fontWeight: 500,
    cursor: "pointer",
    transition: "background 0.2s, transform 0.15s",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
};
