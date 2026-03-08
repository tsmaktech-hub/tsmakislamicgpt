import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, 
  LogOut, 
  User, 
  Moon, 
  Sun, 
  MessageSquare, 
  BookOpen, 
  ShieldCheck,
  ChevronRight,
  Loader2,
  History
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { generateIslamicResponse } from './services/geminiService';

// Types
interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface UserData {
  id: number;
  email: string;
  name: string;
}

interface ChatHistory {
  id: number;
  message: string;
  response: string;
  timestamp: string;
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<UserData | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [history, setHistory] = useState<ChatHistory[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Session Persistence: Check localStorage on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('tsmak_user');
    const savedToken = localStorage.getItem('tsmak_token');
    
    if (savedUser && savedToken) {
      try {
        const userData = JSON.parse(savedUser);
        setUser(userData);
        setIsLoggedIn(true);
        (window as any)._sessionToken = savedToken;
        fetchHistory(savedToken);
      } catch (e) {
        console.error("Failed to restore session", e);
        localStorage.removeItem('tsmak_user');
        localStorage.removeItem('tsmak_token');
      }
    }
  }, []);

  // Inactivity Logout: 5 minutes
  const resetInactivityTimer = () => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    
    if (isLoggedIn) {
      inactivityTimerRef.current = setTimeout(() => {
        handleLogout(true); // Auto-logout due to inactivity
      }, 5 * 60 * 1000); // 5 minutes
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
      
      const handleUserActivity = () => {
        resetInactivityTimer();
      };

      events.forEach(event => {
        window.addEventListener(event, handleUserActivity);
      });

      resetInactivityTimer();

      return () => {
        events.forEach(event => {
          window.removeEventListener(event, handleUserActivity);
        });
        if (inactivityTimerRef.current) {
          clearTimeout(inactivityTimerRef.current);
        }
      };
    }
  }, [isLoggedIn]);

  const fetchHistory = async (token: string) => {
    try {
      const res = await fetch('/api/chats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
          const data = await res.json();
          setHistory(data);
        }
      }
    } catch (err) {
      console.error("Failed to fetch history", err);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        const { token, user } = event.data;
        setUser(user);
        setIsLoggedIn(true);
        fetchHistory(token);
        (window as any)._sessionToken = token;
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleGoogleLogin = () => {
    setError("Google login is currently unavailable. Please use email and password.");
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/signup';
    const body = authMode === 'login' ? { email, password } : { email, password, name };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      
    let data;
    const contentType = res.headers.get("content-type");
    const isJson = contentType && contentType.indexOf("application/json") !== -1;
    
    if (isJson) {
      try {
        data = await res.json();
      } catch (parseError: any) {
        const text = await res.text().catch(() => "Could not read response body");
        throw new Error(`Failed to parse server response (${res.status}): ${text.substring(0, 100)}`);
      }
    } else {
      const text = await res.text().catch(() => "Could not read response body");
      throw new Error(`Server Error (${res.status}): ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);
    }
    
    if (!res.ok) throw new Error(data.error || data.message || `Authentication failed (${res.status})`);
      
      // Store token and user in state and localStorage
      setUser(data.user);
      setIsLoggedIn(true);
      fetchHistory(data.token);
      
      localStorage.setItem('tsmak_user', JSON.stringify(data.user));
      localStorage.setItem('tsmak_token', data.token);
      
      // We still need the token for subsequent API calls in this session
      (window as any)._sessionToken = data.token; 
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = (isAuto = false) => {
    if (!isAuto) {
      const confirmed = window.confirm("Are you sure you want to logout?");
      if (!confirmed) return;
    }

    setIsLoggedIn(false);
    setUser(null);
    setMessages([]);
    setHistory([]);
    (window as any)._sessionToken = null;
    localStorage.removeItem('tsmak_user');
    localStorage.removeItem('tsmak_token');
    
    if (isAuto) {
      alert("You have been logged out due to inactivity.");
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsTyping(true);

    try {
      const response = await generateIslamicResponse(userMessage);
      setMessages(prev => [...prev, { role: 'assistant', content: response || 'I apologize, I could not generate a response.' }]);
      
      // Save to history
      const token = (window as any)._sessionToken;
      await fetch('/api/chats', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message: userMessage, response }),
      });
      fetchHistory(token!);
    } catch (err: any) {
      let cleanError = err.message;
      try {
        // Try to parse if it's a JSON string from the server
        const parsed = JSON.parse(err.message);
        cleanError = parsed.error?.message || parsed.error || err.message;
      } catch (e) {
        // Not JSON, keep as is
      }
      setMessages(prev => [...prev, { role: 'assistant', content: `Peace be upon you. I encountered an error: ${cleanError}. Please try again.` }]);
    } finally {
      setIsTyping(false);
    }
  };

  const loadFromHistory = (item: ChatHistory) => {
    setMessages([
      { role: 'user', content: item.message },
      { role: 'assistant', content: item.response }
    ]);
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 auth-bg">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-sm glass-panel p-6 rounded-3xl shadow-2xl"
        >
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-islamic-green/80 text-white mb-3 shadow-lg backdrop-blur-md">
              <Moon className="w-7 h-7 text-islamic-gold" />
            </div>
            <h1 className="text-xl font-sans font-bold text-white">Tsmak Tech</h1>
            <p className="text-white/80 mt-1 text-xs">Your companion for Islamic knowledge</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-3">
            {authMode === 'signup' && (
              <div>
                <label className="block text-xs font-semibold text-white/90 mb-1 uppercase tracking-wider">Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-white/40 focus:ring-2 focus:ring-islamic-gold focus:border-transparent outline-none transition-all text-sm"
                  placeholder="Abdullah Ahmad"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-white/90 mb-1 uppercase tracking-wider">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-white/40 focus:ring-2 focus:ring-islamic-gold focus:border-transparent outline-none transition-all text-sm"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-white/90 mb-1 uppercase tracking-wider">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-white/40 focus:ring-2 focus:ring-islamic-gold focus:border-transparent outline-none transition-all text-sm"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-red-200 text-xs bg-red-900/40 p-3 rounded-lg border border-red-500/50">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-islamic-gold text-islamic-green py-2.5 rounded-xl font-bold hover:bg-yellow-500 transition-colors flex items-center justify-center gap-2 disabled:opacity-70 shadow-lg text-sm"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (authMode === 'login' ? 'Sign In' : 'Create Account')}
            </button>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10"></div>
              </div>
              <div className="relative flex justify-center text-[10px] uppercase">
                <span className="px-2 text-white/40">Or continue with</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              className="w-full bg-white/5 border border-white/10 text-white py-2.5 rounded-xl font-semibold hover:bg-white/10 transition-all flex items-center justify-center gap-3 text-sm"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continue with Google
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
              className="text-white/90 text-[11px] font-semibold hover:text-white hover:underline transition-colors"
            >
              {authMode === 'login' ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-islamic-cream">
      {/* Sidebar */}
      <aside className="hidden md:flex w-72 flex-col bg-islamic-green text-white shadow-2xl z-20">
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2 bg-white/10 rounded-lg">
              <Moon className="w-5 h-5 text-islamic-gold" />
            </div>
            <span className="font-sans font-bold text-lg">Tsmak Tech</span>
          </div>
          
          <button 
            onClick={() => setMessages([])}
            className="w-full flex items-center gap-3 px-4 py-2.5 bg-white/10 rounded-xl hover:bg-white/20 transition-all text-xs font-semibold uppercase tracking-wider"
          >
            <MessageSquare className="w-4 h-4" />
            New Consultation
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <div className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] px-4 mb-4">Consultation History</div>
          {history.length > 0 ? (
            history.map((item) => (
              <button
                key={item.id}
                onClick={() => loadFromHistory(item)}
                className="w-full text-left px-4 py-3 rounded-xl hover:bg-white/5 transition-all group"
              >
                <p className="text-xs font-medium text-white/80 truncate group-hover:text-white">{item.message}</p>
                <p className="text-[10px] text-white/30 mt-1">{new Date(item.timestamp).toLocaleDateString()}</p>
              </button>
            ))
          ) : (
            <div className="px-4 py-2 text-xs text-white/40 italic">No history yet</div>
          )}
        </div>

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 mb-4">
            <div className="w-8 h-8 rounded-full bg-islamic-gold flex items-center justify-center text-islamic-green font-bold text-xs">
              {user?.name ? user.name[0] : '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate">{user?.name}</p>
              <p className="text-[10px] text-white/40 truncate">{user?.email}</p>
            </div>
          </div>
          <button 
            onClick={() => handleLogout()}
            className="w-full flex items-center gap-3 px-4 py-2 text-white/60 hover:text-white hover:bg-white/5 rounded-xl transition-all text-xs font-medium"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative islamic-pattern overflow-hidden">
        {/* Header */}
        <header className="h-14 glass-panel flex items-center justify-between px-6 z-10">
          <div className="flex items-center gap-2 md:hidden">
            <Moon className="w-5 h-5 text-islamic-green" />
            <span className="font-sans font-bold text-base text-islamic-green">Tsmak Tech</span>
          </div>
          <div className="flex items-center gap-4 ml-auto">
            <div className="flex items-center gap-2 px-3 py-1 bg-islamic-green/5 rounded-full text-[10px] font-bold text-islamic-green uppercase tracking-wider">
              <ShieldCheck className="w-3 h-3" />
              Verified Sources
            </div>
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center max-w-xl mx-auto text-center space-y-6">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-16 h-16 rounded-2xl bg-islamic-green/5 flex items-center justify-center"
              >
                <BookOpen className="w-8 h-8 text-islamic-green" />
              </motion.div>
              <div>
                <h2 className="text-xl font-sans font-bold text-islamic-green mb-3">
                  Assalamu Alaikum Warahmatullahi Wabarakatuh, {user?.name}
                </h2>
                <p className="text-slate-600 text-sm leading-relaxed">
                  I am Tsmak-Islamic GPT. Ask me anything about Fiqh, Aqidah, or Seerah. 
                  I provide evidence from the Quran and authentic Hadith.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 w-full">
                {[
                  "What are the virtues of Tahajjud prayer?",
                  "Explain the concept of Tawakkul in Islam.",
                  "What does the Quran say about patience?",
                  "Tell me a Hadith about good character."
                ].map((q, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(q)}
                    className="p-3.5 glass-panel rounded-xl text-left text-xs hover:border-islamic-green transition-all group"
                  >
                    <p className="text-slate-700 group-hover:text-islamic-green transition-colors font-medium">{q}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((msg, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[90%] rounded-2xl p-5 ${
                    msg.role === 'user' 
                      ? 'bg-islamic-green text-white shadow-md' 
                      : 'glass-panel text-slate-800 shadow-sm'
                  }`}>
                    <div className="prose prose-slate prose-sm max-w-none">
                      <ReactMarkdown 
                        components={{
                          blockquote: ({ children }) => (
                            <div className="arabic-text text-xl my-3 p-4 bg-islamic-green/5 rounded-lg border-r-4 border-islamic-gold text-right leading-loose">
                              {children}
                            </div>
                          ),
                          h1: ({ children }) => <h1 className="text-base font-serif font-bold text-islamic-green mb-1.5">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-sm font-serif font-bold text-islamic-green mt-3 mb-1.5">{children}</h2>,
                          p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed text-sm">{children}</p>,
                          li: ({ children }) => <li className="text-sm mb-1">{children}</li>,
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                </motion.div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="glass-panel rounded-2xl p-4 flex items-center gap-3 shadow-sm">
                    <div className="flex gap-1">
                      <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1.5 h-1.5 bg-islamic-green rounded-full" />
                      <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1.5 h-1.5 bg-islamic-green rounded-full" />
                      <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1.5 h-1.5 bg-islamic-green rounded-full" />
                    </div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Consulting sources...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 md:p-6 bg-gradient-to-t from-islamic-cream via-islamic-cream to-transparent">
          <form 
            onSubmit={handleSendMessage}
            className="max-w-3xl mx-auto relative"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question about Islam..."
              className="w-full pl-5 pr-14 py-3.5 rounded-xl glass-panel focus:ring-2 focus:ring-islamic-green focus:border-transparent outline-none transition-all shadow-xl text-sm"
            />
            <button
              type="submit"
              disabled={!input.trim() || isTyping}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-islamic-green text-white rounded-lg flex items-center justify-center hover:bg-emerald-900 transition-colors disabled:opacity-50 shadow-md"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
          <p className="text-center text-[9px] text-slate-400 mt-4 uppercase tracking-[0.3em] font-bold">
            Tsmak-Islamic GPT • Knowledge is Light
          </p>
        </div>
      </main>
    </div>
  );
}
