"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-screen">
      <h1>Let’s reconnect.</h1>
      <p>Your dashboard couldn’t open. Try loading it again.</p>
      <button className="primary-button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
