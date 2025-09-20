// src/pages/SignUpPage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import Layout from '@/components/layout/Layout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import ReCAPTCHA from 'react-google-recaptcha';
import toast from 'react-hot-toast';

const SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '';

export default function SignUpPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!email || !password) {
      toast.error('Please enter email and password');
      return;
    }

    if (!captchaToken) {
      toast.error('Please complete the CAPTCHA');
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      console.error('Signup error:', error.message);
      toast.error(error.message);
    } else {
      toast.success('Confirmation email sent. Please check your inbox.');
      navigate('/signin');
    }
  };

  return (
    <Layout>
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 p-6 rounded-lg shadow-lg">
          <h2 className="text-2xl font-bold text-center mb-6">Create Your Account</h2>

          <Input
            placeholder="Email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="mb-4"
          />

          <Input
            placeholder="Password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="mb-4"
          />

          <div className="mb-4 flex justify-center">
            <ReCAPTCHA sitekey={SITE_KEY} onChange={setCaptchaToken} />
          </div>

          <Button onClick={handleSignup} className="w-full" disabled={loading}>
            {loading ? 'Signing up...' : 'Sign Up'}
          </Button>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <a href="/signin" className="text-blue-600 hover:underline">
              Sign in here.
            </a>
          </p>
        </div>
      </div>
    </Layout>
  );
}
