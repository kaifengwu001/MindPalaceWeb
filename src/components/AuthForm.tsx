import React, { useState } from "react";
// 1) Import everything from the top-level aws-amplify:
import { Auth } from "aws-amplify";

// 2) For the CognitoUser type (optional, but nice for TypeScript):
import { CognitoUser } from "amazon-cognito-identity-js"; 

// UI stuff
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface AuthFormProps {
  onAuthSuccess: (user: Record<string, unknown>) => void;
}
  
export const AuthForm = ({ onAuthSuccess }: AuthFormProps) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [isEmailCodeSignIn, setIsEmailCodeSignIn] = useState(false);

  // Common fields
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Sign-up fields
  const [password, setPassword] = useState("");
  const [needsVerification, setNeedsVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");

  // Email Code Sign-in fields
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [challengeUser, setChallengeUser] = useState<CognitoUser | null>(null);

  // ------------------------------------------
  // 1) Handle Email + Password (Sign Up / Verify / Sign In)
  // ------------------------------------------
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Use Auth.signUp from 'aws-amplify'
      await Auth.signUp({
        username: email,
        password,
        attributes: { email },
      });
      setNeedsVerification(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  };

  const handleVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Confirm sign-up
      await Auth.confirmSignUp(email, verificationCode);

      // Automatically sign them in
      const user = await Auth.signIn(email, password);

      if (user?.signInUserSession) {
        onAuthSuccess({ email, nextStep: user?.challengeName });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const user = await Auth.signIn(email, password);

      if (user?.signInUserSession) {
        onAuthSuccess({ email, nextStep: user?.challengeName });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  // ------------------------------------------
  // 2) Handle Email Code (Passwordless) Sign-in
  // ------------------------------------------
  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // 1) Initiate the custom-auth flow by calling signIn with only the email
      const user = await Auth.signIn(email);
      // Cognito automatically sends the code to their email
      setChallengeUser(user);
      setCodeSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send code");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!challengeUser) {
        throw new Error("No challenge user to verify against");
      }
      // 2) Respond with the code
      const loggedInUser = await Auth.sendCustomChallengeAnswer(challengeUser, code);

      // If sign-in succeeded, Cognito returns signInUserSession:
      if (loggedInUser?.signInUserSession) {
        onAuthSuccess({ email, nextStep: loggedInUser?.challengeName });
      } else {
        setError("Unexpected challenge. Please try again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setLoading(false);
    }
  };

  // ------------------------------------------
  // Render UI states
  // ------------------------------------------
  let formContent = null;

  if (needsVerification) {
    // -- Sign-Up Verification Step
    formContent = (
      <>
        <CardTitle>Verify Your Email</CardTitle>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <form onSubmit={handleVerification} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Verification Code
            </label>
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
    // -- Passwordless Flow
    if (!codeSent) {
      // Step 1: Ask for email, then send code
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
      // Step 2: Code was sent, verify
      formContent = (
        <>
          <CardTitle>Enter the Code from Email</CardTitle>
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
              {loading ? "Verifying..." : "Verify Code"}
            </Button>
          </form>
        </>
      );
    }
  } else {
    // -- Email + Password Flow (Sign In or Sign Up)
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
          {isSignUp
            ? "Already have an account? Sign In"
            : "Need an account? Sign Up"}
        </button>
      </>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        {/* Optionally show toggles: email-pass or email-code */}
        <div className="flex gap-3">
          <button
            onClick={() => {
              setIsEmailCodeSignIn(false);
              setIsSignUp(false);
              setNeedsVerification(false);
              setError(null);
            }}
            className={`text-sm ${!isEmailCodeSignIn ? "font-semibold" : ""}`}
          >
            Email + Password
          </button>
          <button
            onClick={() => {
              setIsEmailCodeSignIn(true);
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