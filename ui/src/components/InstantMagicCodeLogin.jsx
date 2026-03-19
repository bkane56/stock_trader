import React, { useState } from "react";

export function InstantMagicCodeLogin({ db, authError }) {
  const [email, setEmail] = useState("");
  const [sentEmail, setSentEmail] = useState("");
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const sendCode = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");
    try {
      await db.auth.sendMagicCode({ email: email.trim() });
      setSentEmail(email.trim());
      setCode("");
    } catch (error) {
      setErrorMessage(error?.body?.message || "Unable to send verification code.");
      setSentEmail("");
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifyCode = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");
    try {
      await db.auth.signInWithMagicCode({
        email: sentEmail.trim(),
        code: code.trim(),
      });
    } catch (error) {
      setErrorMessage(error?.body?.message || "Invalid code, please retry.");
      setCode("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
        <h1 className="text-3xl font-black tracking-tight text-slate-900">
          Sign in to InvestAI
        </h1>
        <p className="mt-3 text-sm font-medium text-slate-500">
          Use your email to receive a one-time code. Your portfolio and strategy
          sync through InstantDB after sign-in.
        </p>

        {authError ? (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
            {authError.message}
          </p>
        ) : null}
        {errorMessage ? (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
            {errorMessage}
          </p>
        ) : null}

        {!sentEmail ? (
          <form className="mt-8 space-y-4" onSubmit={sendCode}>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
              Email
            </label>
            <input
              value={email}
              type="email"
              required
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-2xl border border-slate-200 px-4 py-4 text-sm font-medium text-slate-700 focus:border-teal-500 focus:outline-none"
            />
            <button
              disabled={isSubmitting}
              className="w-full rounded-2xl bg-slate-900 px-4 py-4 text-xs font-black uppercase tracking-widest text-white transition-all hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
            >
              {isSubmitting ? "Sending..." : "Send Magic Code"}
            </button>
          </form>
        ) : (
          <form className="mt-8 space-y-4" onSubmit={verifyCode}>
            <p className="rounded-xl border border-teal-100 bg-teal-50 px-4 py-3 text-xs font-bold text-teal-800">
              Enter the code sent to {sentEmail}.
            </p>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
              Verification Code
            </label>
            <input
              value={code}
              type="text"
              required
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              className="w-full rounded-2xl border border-slate-200 px-4 py-4 text-sm font-medium text-slate-700 focus:border-teal-500 focus:outline-none"
            />
            <button
              disabled={isSubmitting}
              className="w-full rounded-2xl bg-slate-900 px-4 py-4 text-xs font-black uppercase tracking-widest text-white transition-all hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
            >
              {isSubmitting ? "Verifying..." : "Verify & Sign In"}
            </button>
            <button
              type="button"
              onClick={() => {
                setSentEmail("");
                setCode("");
                setErrorMessage("");
              }}
              className="w-full rounded-2xl border border-slate-200 px-4 py-4 text-xs font-black uppercase tracking-widest text-slate-500 transition-all hover:bg-slate-50"
            >
              Use a Different Email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
