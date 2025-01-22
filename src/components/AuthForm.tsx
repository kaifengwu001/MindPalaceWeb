import React, { useState } from "react";
import {
  signUp,
  confirmSignUp,
  signIn,
  type SignInOutput,
  confirmSignIn
} from "aws-amplify/auth";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface AuthFormProps {
  onAuthSuccess: (user: Record<string, unknown>) => void;
}

export const AuthForm = ({ onAuthSuccess }: AuthFormProps) => {
  // ---------------
  // State variables
  // ---------------
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [needsVerification, setNeedsVerification] = useState(false);

  // "Sign in with Email Code" (passwordless) flow
  const [isEmailCodeSignIn, setIsEmailCodeSignIn] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [challengeUser, setChallengeUser] = useState<SignInOutput | null>(null);

  // Error and loading indicators
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ---------------------------------------------------------------------
  // (1) Sign Up with Email + Password
  // ---------------------------------------------------------------------
  const handleSignUp = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await signUp({
        username: email,
        password,
        options: {
          userAttributes: {
            email
          }
        }
      });
      setNeedsVerification(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------
  // (2) Verify Email (after Sign Up)
  // ---------------------------------------------------------------------
  const handleVerification = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await confirmSignUp({
        username: email,
        confirmationCode: verificationCode
      });

      // After confirmation, attempt to sign in
      const signInResult = await signIn({
        username: email,
        password
      });

      if (signInResult.isSignedIn) {
        onAuthSuccess({
          email,
          nextStep: signInResult.nextStep
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------
  // (3) Sign In with Email + Password
  // ---------------------------------------------------------------------
  const handleSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const signInResult = await signIn({
        username: email,
        password
      });

      if (signInResult.isSignedIn) {
        onAuthSuccess({
          email,
          nextStep: signInResult.nextStep
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------
  // (4) "Sign In with Email Code" Flow (Passwordless)
  // ---------------------------------------------------------------------
  // Step A: Initiate the code flow
  const handleSendCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // signIn with just email triggers custom challenge
      const signInResult = await signIn({
        username: email
      });
      
      if (signInResult.nextStep?.signInStep === 'CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE') {
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

  // Step B: Verify the one-time code
  const handleVerifyCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!challengeUser) {
        throw new Error("No user challenge in progress.");
      }

      const result = await confirmSignIn({
        challengeResponse: code
      });

      if (result.isSignedIn) {
        onAuthSuccess({
          email,
          nextStep: result.nextStep
        });
      } else {
        setError("Unexpected challenge. Please try again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------
  // Render the appropriate UI
  // ---------------------------------------------------------------------
  let formContent: JSX.Element;

  if (needsVerification) {
    // (a) "Verify Email" after Sign Up
    formContent = (
      <>
        <CardTitle>Verify Email</CardTitle>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <form onSubmit={handleVerification} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Verification Code</label>
            <Input
              type="text"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Verifying..." : "Verify Email"}
          </Button>
        </form>
      </>
    );
  } else if (isEmailCodeSignIn) {
    // (b) Sign In with Email Code (Passwordless)
    if (!codeSent) {
      // Step A: Request code
      formContent = (
        <>
          <CardTitle>Sign In with Email Code</CardTitle>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={handleSendCode} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending..." : "Send Code"}
            </Button>
          </form>
        </>
      );
    } else {
      // Step B: Verify the code
      formContent = (
        <>
          <CardTitle>Enter Code from Email</CardTitle>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Code</label>
              <Input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Verifying..." : "Verify"}
            </Button>
          </form>
        </>
      );
    }
  } else {
    // (c) Default: Sign In or Sign Up with Email + Password
    const heading = isSignUp ? "Sign Up" : "Sign In";

    formContent = (
      <>
        <CardTitle>{heading}</CardTitle>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <form onSubmit={isSignUp ? handleSignUp : handleSignIn} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Processing..." : heading}
          </Button>
        </form>

        <button
          onClick={() => setIsSignUp(!isSignUp)}
          className="mt-4 text-sm text-blue-500 hover:text-blue-600"
        >
          {isSignUp ? "Already have an account? Sign In" : "Need an account? Sign Up"}
        </button>
      </>
    );
  }

  // ---------------------------------------------------------------------
  // Return the card and toggle buttons
  // ---------------------------------------------------------------------
  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <div className="flex gap-3">
          <button
            onClick={() => {
              setIsEmailCodeSignIn(false);
              setCodeSent(false);
              setNeedsVerification(false);
              setError(null);
              setIsSignUp(false);
            }}
            className={`text-sm ${!isEmailCodeSignIn ? "font-semibold" : ""}`}
          >
            Email + Password
          </button>
          <button
            onClick={() => {
              setIsEmailCodeSignIn(true);
              setIsSignUp(false);
              setError(null);
            }}
            className={`text-sm ${isEmailCodeSignIn ? "font-semibold" : ""}`}
          >
            Sign In with Code
          </button>
        </div>
      </CardHeader>
      <CardContent>{formContent}</CardContent>
    </Card>
  );
};


// import React, { useState } from 'react';
// import { signUp, signIn, confirmSignUp } from 'aws-amplify/auth';
// import { AlertCircle } from 'lucide-react';
// import { Alert, AlertDescription } from '@/components/ui/alert';
// import { Button } from '@/components/ui/button';
// import { Input } from '@/components/ui/input';
// import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

// interface AuthFormProps {
//   onAuthSuccess: (user: Record<string, unknown>) => void;
// }

// export const AuthForm = ({ onAuthSuccess }: AuthFormProps) => {
//   const [isSignUp, setIsSignUp] = useState(false);
//   const [email, setEmail] = useState('');
//   const [password, setPassword] = useState('');
//   const [verificationCode, setVerificationCode] = useState('');
//   const [needsVerification, setNeedsVerification] = useState(false);
//   const [error, setError] = useState<string | null>(null);
//   const [loading, setLoading] = useState(false);

//   const handleSignUp = async (e: React.FormEvent) => {
//     e.preventDefault();
//     setLoading(true);
//     setError(null);

//     try {
//       await signUp({
//         username: email,
//         password,
//         options: {
//           userAttributes: {
//             email
//           }
//         }
//       });
//       setNeedsVerification(true);
//     } catch (err) {
//       setError(err instanceof Error ? err.message : 'Sign up failed');
//     } finally {
//       setLoading(false);
//     }
//   };

//   const handleVerification = async (e: React.FormEvent) => {
//     e.preventDefault();
//     setLoading(true);
//     setError(null);

//     try {
//       await confirmSignUp({
//         username: email,
//         confirmationCode: verificationCode
//       });
//       const { isSignedIn, nextStep } = await signIn({
//         username: email,
//         password
//       });
//       if (isSignedIn) {
//         onAuthSuccess({ email, nextStep });
//       }
//     } catch (err) {
//       setError(err instanceof Error ? err.message : 'Verification failed');
//     } finally {
//       setLoading(false);
//     }
//   };

//   const handleSignIn = async (e: React.FormEvent) => {
//     e.preventDefault();
//     setLoading(true);
//     setError(null);

//     try {
//       const { isSignedIn, nextStep } = await signIn({
//         username: email,
//         password
//       });
//       if (isSignedIn) {
//         onAuthSuccess({ email, nextStep });
//       }
//     } catch (err) {
//       setError(err instanceof Error ? err.message : 'Sign in failed');
//     } finally {
//       setLoading(false);
//     }
//   };

//   return (
//     <Card className="w-full max-w-md mx-auto">
//       <CardHeader>
//         <CardTitle>
//           {needsVerification ? 'Verify Email' : isSignUp ? 'Sign Up' : 'Sign In'}
//         </CardTitle>
//       </CardHeader>
//       <CardContent>
//         {error && (
//           <Alert variant="destructive" className="mb-4">
//             <AlertCircle className="h-4 w-4" />
//             <AlertDescription>{error}</AlertDescription>
//           </Alert>
//         )}

//         {needsVerification ? (
//           <form onSubmit={handleVerification} className="space-y-4">
//             <div>
//               <label className="block text-sm font-medium mb-1">
//                 Verification Code
//               </label>
//               <Input
//                 type="text"
//                 value={verificationCode}
//                 onChange={e => setVerificationCode(e.target.value)}
//                 required
//               />
//             </div>
//             <Button
//               type="submit"
//               className="w-full"
//               disabled={loading}
//             >
//               {loading ? 'Verifying...' : 'Verify Email'}
//             </Button>
//           </form>
//         ) : (
//           <form onSubmit={isSignUp ? handleSignUp : handleSignIn} className="space-y-4">
//             <div>
//               <label className="block text-sm font-medium mb-1">
//                 Email
//               </label>
//               <Input
//                 type="email"
//                 value={email}
//                 onChange={e => setEmail(e.target.value)}
//                 required
//               />
//             </div>
//             <div>
//               <label className="block text-sm font-medium mb-1">
//                 Password
//               </label>
//               <Input
//                 type="password"
//                 value={password}
//                 onChange={e => setPassword(e.target.value)}
//                 required
//               />
//             </div>
//             <Button
//               type="submit"
//               className="w-full"
//               disabled={loading}
//             >
//               {loading ? 'Processing...' : isSignUp ? 'Sign Up' : 'Sign In'}
//             </Button>
//           </form>
//         )}

//         {!needsVerification && (
//           <button
//             onClick={() => setIsSignUp(!isSignUp)}
//             className="mt-4 text-sm text-blue-500 hover:text-blue-600"
//           >
//             {isSignUp ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}
//           </button>
//         )}
//       </CardContent>
//     </Card>
//   );
// };