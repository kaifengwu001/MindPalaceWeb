import React, { useState } from "react";
import {
  signUp,
  confirmSignUp,
  signIn,
  confirmSignIn,
  resetPassword,
  confirmResetPassword,
  type SignInOutput
} from "aws-amplify/auth";
import { AlertCircle, Lock, Mail, KeyRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { LiquidGlass } from "@/components/ui/LiquidGlass";

interface AuthFormProps {
  onAuthSuccess: (user: Record<string, unknown>) => void;
}

export const AuthForm = ({ onAuthSuccess }: AuthFormProps) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [needsVerification, setNeedsVerification] = useState(false);

  const [isEmailCodeSignIn, setIsEmailCodeSignIn] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [challengeUser, setChallengeUser] = useState<SignInOutput | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isResetCodeSent, setIsResetCodeSent] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const handleSignUp = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signUp({
        username: email,
        password,
        options: { userAttributes: { email } }
      });
      setNeedsVerification(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  };

  const handleVerification = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await confirmSignUp({ username: email, confirmationCode: verificationCode });
      const signInResult = await signIn({ username: email, password });
      if (signInResult.isSignedIn) {
        onAuthSuccess({ email, nextStep: signInResult.nextStep });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const signInResult = await signIn({ username: email, password });
      if (signInResult.isSignedIn) {
        onAuthSuccess({ email, nextStep: signInResult.nextStep });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSendCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const signInResult = await signIn({ username: email });
      if (signInResult.nextStep?.signInStep === "CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE") {
        setChallengeUser(signInResult);
        setCodeSent(true);
      } else {
        setError("Unexpected authentication flow");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send code");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (!challengeUser) throw new Error("No user challenge in progress.");
      const result = await confirmSignIn({ challengeResponse: code });
      if (result.isSignedIn) {
        onAuthSuccess({ email, nextStep: result.nextStep });
      } else {
        setError("Unexpected challenge. Please try again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await resetPassword({ username: email });
      setIsResetCodeSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset code");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmForgotPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await confirmResetPassword({ username: email, confirmationCode: resetCode, newPassword });
      const signInResult = await signIn({ username: email, password: newPassword });
      if (signInResult.isSignedIn) {
        onAuthSuccess({ email, nextStep: signInResult.nextStep });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  const ErrorAlert = () => error ? (
    <div className="mb-4 p-3.5 rounded-2xl flex items-center gap-3 text-red-200 backdrop-blur-sm bg-red-500/15 border border-red-500/30">
      <AlertCircle className="h-4 w-4 flex-shrink-0" />
      <span className="text-sm">{error}</span>
    </div>
  ) : null;

  const GlassButton = ({ children, disabled, type = "submit" }: { children: React.ReactNode; disabled?: boolean; type?: "submit" | "button" }) => (
    <button
      type={type}
      disabled={disabled}
      className="w-full py-3 px-4 rounded-2xl text-white font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 active:scale-[0.98]"
      style={{
        background: 'linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.08) 100%)',
        border: '1px solid rgba(255,255,255,0.25)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.2), inset 0 1px 1px rgba(255,255,255,0.15)',
      }}
    >
      {children}
    </button>
  );

  let formContent: JSX.Element;

  if (isResettingPassword) {
    if (!isResetCodeSent) {
      formContent = (
        <>
          <h3 className="text-lg font-semibold text-white mb-6">Reset Password</h3>
          <ErrorAlert />
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white/60 mb-2">Email</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <GlassButton disabled={loading}>{loading ? "Sending..." : "Send Reset Code"}</GlassButton>
          </form>
        </>
      );
    } else {
      formContent = (
        <>
          <h3 className="text-lg font-semibold text-white mb-6">Enter Reset Code</h3>
          <ErrorAlert />
          <form onSubmit={handleConfirmForgotPassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white/60 mb-2">Reset Code</label>
              <Input type="text" value={resetCode} onChange={(e) => setResetCode(e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-white/60 mb-2">New Password</label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
            </div>
            <GlassButton disabled={loading}>{loading ? "Resetting..." : "Set New Password"}</GlassButton>
          </form>
        </>
      );
    }
  } else if (needsVerification) {
    formContent = (
      <>
        <h3 className="text-lg font-semibold text-white mb-6">Verify Email</h3>
        <ErrorAlert />
        <form onSubmit={handleVerification} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/60 mb-2">Verification Code</label>
            <Input type="text" value={verificationCode} onChange={(e) => setVerificationCode(e.target.value)} required />
          </div>
          <GlassButton disabled={loading}>{loading ? "Verifying..." : "Verify Email"}</GlassButton>
        </form>
      </>
    );
  } else if (isEmailCodeSignIn) {
    if (!codeSent) {
      formContent = (
        <>
          <h3 className="text-lg font-semibold text-white mb-6">Sign In with Email Code</h3>
          <ErrorAlert />
          <form onSubmit={handleSendCode} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white/60 mb-2">Email</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <GlassButton disabled={loading}>{loading ? "Sending..." : "Send Code"}</GlassButton>
          </form>
        </>
      );
    } else {
      formContent = (
        <>
          <h3 className="text-lg font-semibold text-white mb-6">Enter Code from Email</h3>
          <ErrorAlert />
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white/60 mb-2">Code</label>
              <Input type="text" value={code} onChange={(e) => setCode(e.target.value)} required />
            </div>
            <GlassButton disabled={loading}>{loading ? "Verifying..." : "Verify"}</GlassButton>
          </form>
        </>
      );
    }
  } else {
    const heading = isSignUp ? "Sign Up" : "Sign In";
    formContent = (
      <>
        <h3 className="text-lg font-semibold text-white mb-6">{heading}</h3>
        <ErrorAlert />
        <form onSubmit={isSignUp ? handleSignUp : handleSignIn} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/60 mb-2">Email</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/60 mb-2">Password</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <GlassButton disabled={loading}>{loading ? "Processing..." : heading}</GlassButton>
        </form>
        <div className="mt-5 pt-4 border-t border-white/10 flex justify-between items-center">
          <button
            onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
            className="text-sm text-white/60 hover:text-white transition-colors"
          >
            {isSignUp ? "Already have an account? Sign In" : "Need an account? Sign Up"}
          </button>
          {!isSignUp && (
            <button
              type="button"
              onClick={() => { setIsResettingPassword(true); setIsResetCodeSent(false); setError(null); }}
              className="text-sm text-white/40 hover:text-white/70 transition-colors"
            >
              Forgot password?
            </button>
          )}
        </div>
      </>
    );
  }

  return (
    <LiquidGlass className="w-full max-w-md" cornerRadius={32} padding="32px">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-5">
          <div 
            className="w-11 h-11 rounded-2xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 100%)',
              border: '1px solid rgba(255,255,255,0.2)',
              boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.1), 0 2px 8px rgba(0,0,0,0.15)',
            }}
          >
            <Lock className="h-5 w-5 text-white" />
          </div>
          <h2 className="text-xl font-semibold text-white tracking-tight">Sign In to Mind Palace</h2>
        </div>
        <div 
          className="flex gap-1.5 p-1.5 rounded-2xl"
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)',
          }}
        >
          <button
            onClick={() => {
              setIsEmailCodeSignIn(false);
              setCodeSent(false);
              setNeedsVerification(false);
              setError(null);
              setIsSignUp(false);
              setIsResettingPassword(false);
              setIsResetCodeSent(false);
            }}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
              !isEmailCodeSignIn ? "text-white" : "text-white/50 hover:text-white/80 hover:bg-white/5"
            }`}
            style={!isEmailCodeSignIn ? {
              background: 'linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.1) 100%)',
              border: '1px solid rgba(255,255,255,0.2)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15), inset 0 1px 1px rgba(255,255,255,0.1)',
            } : {}}
          >
            <Mail className="h-4 w-4" />
            Email + Password
          </button>
          <button
            onClick={() => {
              setIsEmailCodeSignIn(true);
              setIsSignUp(false);
              setError(null);
              setIsResettingPassword(false);
              setIsResetCodeSent(false);
            }}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
              isEmailCodeSignIn ? "text-white" : "text-white/50 hover:text-white/80 hover:bg-white/5"
            }`}
            style={isEmailCodeSignIn ? {
              background: 'linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.1) 100%)',
              border: '1px solid rgba(255,255,255,0.2)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15), inset 0 1px 1px rgba(255,255,255,0.1)',
            } : {}}
          >
            <KeyRound className="h-4 w-4" />
            Sign In with Code
          </button>
        </div>
      </div>
      <div className="text-white">{formContent}</div>
    </LiquidGlass>
  );
};
