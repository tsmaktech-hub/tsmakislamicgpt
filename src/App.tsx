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
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const key = process.env.GEMINI_API_KEY || ((import.meta as any).env && (import.meta as any).env.VITE_GEMINI_API_KEY);
    if (!key) setApiKeyMissing(true);
  }, []);

  useEffect(() => {
    // Session persistence removed as per user request
  }, []);

  const fetchHistory = async (token: string) => {
    try {
      const res = await fetch('/api/chats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (err) {
      console.error("Failed to fetch history", err);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

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
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Authentication failed');
      
      // Store token in memory only (state) to ensure logout on refresh
      setUser(data.user);
      setIsLoggedIn(true);
      fetchHistory(data.token);
      // We still need the token for subsequent API calls in this session
      (window as any)._sessionToken = data.token; 
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUser(null);
    setMessages([]);
    setHistory([]);
    (window as any)._sessionToken = null;
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
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Peace be upon you. I encountered an error while processing your request. Please try again.' }]);
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
          className="w-full max-w-md glass-panel p-8 rounded-3xl shadow-2xl"
        >
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-islamic-green/80 text-white mb-4 shadow-lg backdrop-blur-md">
              <Moon className="w-8 h-8 text-islamic-gold" />
            </div>
            <h1 className="text-2xl font-sans font-bold text-white">Tsmak-Islamic GPT</h1>
            <p className="text-white/80 mt-2 text-sm">Your companion for Islamic knowledge</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            {authMode === 'signup' && (
              <div>
                <label className="block text-xs font-semibold text-white/90 mb-1 uppercase tracking-wider">Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-white/40 focus:ring-2 focus:ring-islamic-gold focus:border-transparent outline-none transition-all text-sm"
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
                className="w-full px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-white/40 focus:ring-2 focus:ring-islamic-gold focus:border-transparent outline-none transition-all text-sm"
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
                className="w-full px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-white/40 focus:ring-2 focus:ring-islamic-gold focus:border-transparent outline-none transition-all text-sm"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-red-200 text-xs bg-red-900/40 p-3 rounded-lg border border-red-500/50">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-islamic-gold text-islamic-green py-3 rounded-xl font-bold hover:bg-yellow-500 transition-colors flex items-center justify-center gap-2 disabled:opacity-70 shadow-lg"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (authMode === 'login' ? 'Sign In' : 'Create Account')}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
              className="text-white/90 text-sm font-semibold hover:text-white hover:underline transition-colors"
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
            <span className="font-sans font-bold text-lg">Tsmak-Islamic GPT</span>
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
            onClick={handleLogout}
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
            <span className="font-sans font-bold text-base text-islamic-green">Tsmak-Islamic GPT</span>
          </div>
          {apiKeyMissing && (
            <div className="bg-red-500/10 border border-red-500/20 px-3 py-1 rounded-full text-[10px] font-bold text-red-600 uppercase tracking-wider animate-pulse">
              API Key Missing
            </div>
          )}
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
