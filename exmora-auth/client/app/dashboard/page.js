"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [message, setMessage] = useState("");
  const [remaining, setRemaining] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
    }
  }, [router]);

  const sendPrompt = async () => {
    setError("");
    setMessage("");
    const token = localStorage.getItem("token");
    if (!token) {
      forceLogout();
      return;
    }

    try {
      const res = await fetch("http://localhost:5001/api/prompt/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ prompt }),
      });

      // To handle expired/invalid token cases
      if (res.status === 401 || res.status === 403) {
        forceLogout();
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || data.message);
        return;
      }

      setMessage(data.message);
      setRemaining(data.remaining);
      setPrompt("");
    } catch (err) {
      setError("Server error");
    }
  };

  const forceLogout = () => {
    document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    window.location.href = "/login";
  };

  const handleLogout = () => {
    forceLogout();
  };

  return (
    <div style={{ padding: "40px" }}>
      <h2>Dashboard</h2>
      <button onClick={handleLogout}>Logout</button>
      <br />
      <br />

      <textarea
        placeholder="Enter your prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={4}
        cols={40}
      />
      <br />
      <br />

      <button onClick={sendPrompt}>Send Prompt</button>

      {message && <p>{message}</p>}
      {remaining !== null && <p>Remaining prompts today: {remaining}</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}
