import { useState, useEffect, useRef } from "react";
import { 
  Search, Image as ImageIcon, ShieldCheck, Zap, Info, ExternalLink, 
  RefreshCw, BarChart3, CheckCircle2, AlertCircle, Target, Check, X, 
  MessageSquare, LogIn, LogOut, User as UserIcon, Sparkles, Filter, 
  SlidersHorizontal, Maximize2, ChevronRight, Heart, Grid, Compass, 
  ThumbsUp, Download, Layers, Tag, Award, Eye
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { auth, db, signInWithGoogle, signOut } from "./lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { tagAndLogTrace } from "./services/taggingService";
import { fetchTraces, saveVerification, VerificationLabels } from "./services/verificationService";

interface ForgeResponse {
  url: string;
  confidence: number;
  match_level: string;
  attribution?: {
    photographer: string;
    service: string;
    license_url: string;
  };
  metadata: {
    alt_text: string;
    fallback_applied: boolean;
    confidence_level?: "high" | "medium" | "low";
    reason?: string;
  };
  semantic_report?: {
    subject: string[];
    brand: string | null;
    ui_role_fit: string[];
    composition: string[];
    confidence: number;
  };
}

interface EvaluationResult {
  case_id: string;
  case_name: string;
  score: number;
  confidence: number;
  confidence_level: string;
  match_level: string;
  traits_matched: string[];
  trait_accuracy: number;
  is_brand_safe: boolean;
  url: string;
  failure_mode: string;
  recommended_fix: string;
  is_near_miss: boolean;
  near_miss_type: string;
  is_test_set: boolean;
  top_k_accuracy: {
    top1: boolean;
    top3: boolean;
    top5: boolean;
  };
  loss: number;
}

interface EvaluationData {
  results: EvaluationResult[];
  metrics: {
    overall_accuracy: number;
    train_accuracy: number;
    test_accuracy: number;
    accuracy_by_confidence: Record<string, { accuracy: number; count: number }>;
    brand_safety_rate: number;
    avg_score: number;
    retrieval_health: number;
    ranking_efficiency: number;
    failure_modes: Record<string, number>;
    expected_loss: number;
  };
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"playground" | "evaluation" | "verification">("playground");
  const [user, setUser] = useState<User | null>(null);
  const [subject, setSubject] = useState("");
  const [brand, setBrand] = useState("");
  const [uiRole, setUiRole] = useState("hero");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ForgeResponse | null>(null);
  
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalData, setEvalData] = useState<EvaluationData | null>(null);

  // Search Engine UI States
  const [searchExecuted, setSearchExecuted] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<any>(null);
  const [selectedCandidateTags, setSelectedCandidateTags] = useState<any>(null);
  const [candidateTaggingLoading, setCandidateTaggingLoading] = useState(false);
  const [candidateTaggingError, setCandidateTaggingError] = useState<string | null>(null);
  const [selectedCandidateAudit, setSelectedCandidateAudit] = useState<any>(null);
  const [candidateAuditLoading, setCandidateAuditLoading] = useState(false);
  const [candidateAuditError, setCandidateAuditError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<"all" | "unsplash" | "openverse" | "wikimedia">("all");
  const [sortBy, setSortBy] = useState<"score" | "likes">("score");

  // Gemini Indulgence & Page Status States
  const [pageAudit, setPageAudit] = useState<any>(null);
  const [pageAuditLoading, setPageAuditLoading] = useState(false);
  const [pageAuditError, setPageAuditError] = useState<string | null>(null);
  const [accumulatedTokens, setAccumulatedTokens] = useState<number>(0);

  const fetchPageStatus = async (currentSubject: string, currentBrand: string, currentRole: string, currentCandidates: any[]) => {
    if (!currentCandidates || currentCandidates.length === 0) return;
    setPageAuditLoading(true);
    setPageAudit(null);
    setPageAuditError(null);
    try {
      const response = await fetch("/api/ai/page-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: currentSubject,
          brand: currentBrand,
          uiRole: currentRole,
          candidates: currentCandidates.slice(0, 10).map((c: any) => ({
            id: c.id,
            description: c.description,
            score: c.score,
            source: c.source
          }))
        })
      });
      const data = await response.json();
      if (data.success && data.report) {
        setPageAudit(data.report);
        if (data.report.usage) {
          setAccumulatedTokens(prev => prev + data.report.usage.totalTokens);
        }
      } else {
        setPageAuditError(data.error || "Failed to generate page-level audit.");
      }
    } catch (err: any) {
      console.error("Error fetching page status:", err);
      setPageAuditError(err instanceof Error ? err.message : "Error generating page status.");
    } finally {
      setPageAuditLoading(false);
    }
  };

  // Race condition protection
  const requestId = useRef(0);

  useEffect(() => {
    if (selectedCandidate) {
      const currentId = ++requestId.current;
      
      const fetchTags = async () => {
        setCandidateTaggingLoading(true);
        setSelectedCandidateTags(null);
        setCandidateTaggingError(null);
        try {
          const response = await fetch("/api/ai/tag", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ description: selectedCandidate.description })
          });
          const data = await response.json();
          if (currentId === requestId.current) {
            if (data.success && data.tags) {
              setSelectedCandidateTags(data.tags);
              if (data.tags.usage) {
                setAccumulatedTokens(prev => prev + data.tags.usage.totalTokens);
              }
            } else {
              setCandidateTaggingError(data.error || "Failed to analyze candidate");
            }
          }
        } catch (err: any) {
          if (currentId === requestId.current) {
            console.error("Error tagging candidate:", err);
            setCandidateTaggingError(err instanceof Error ? err.message : "Error analyzing candidate");
          }
        } finally {
          if (currentId === requestId.current) {
            setCandidateTaggingLoading(false);
          }
        }
      };

      const fetchAudit = async () => {
        setCandidateAuditLoading(true);
        setSelectedCandidateAudit(null);
        setCandidateAuditError(null);
        try {
          const response = await fetch("/api/ai/audit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageUrl: selectedCandidate.url,
              requestedSubject: subject,
              candidateDescription: selectedCandidate.description
            })
          });
          const data = await response.json();
          if (currentId === requestId.current) {
            if (data.success && data.audit) {
              setSelectedCandidateAudit(data.audit);
              if (data.audit.usage) {
                setAccumulatedTokens(prev => prev + data.audit.usage.totalTokens);
              }
            } else {
              setCandidateAuditError(data.error || "Failed to audit candidate");
            }
          }
        } catch (err: any) {
          if (currentId === requestId.current) {
            console.error("Error auditing candidate:", err);
            setCandidateAuditError(err instanceof Error ? err.message : "Error auditing candidate");
          }
        } finally {
          if (currentId === requestId.current) {
            setCandidateAuditLoading(false);
          }
        }
      };

      fetchTags();
      fetchAudit();
    }
  }, [selectedCandidate, subject]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  const resolveImage = async () => {
    const id = ++requestId.current;
    setLoading(true);
    setSearchExecuted(true);
    setSelectedCandidate(null);
    setSearchError(null);
    
    try {
      const response = await fetch("/api/images/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: {
            image_type: uiRole,
            subject,
            brand,
            ui_role: uiRole,
            style: "modern",
            mood: "energetic"
          },
          constraints: {
            aspect_ratio: uiRole === "hero" ? "16:9" : "1:1"
          }
        }),
      });
      const data = await response.json();
      
      // Only update state if this is still the latest request
      if (id === requestId.current) {
        if (data.error) {
          setSearchError(data.error);
          setResult(null);
        } else if (!data.candidates) {
          setSearchError("No candidates returned from the engine.");
          setResult(null);
        } else {
          setResult(data);
          setSearchError(null);
          
          // Trigger Page Status & Indulgence Audit
          fetchPageStatus(subject, brand, uiRole, data.candidates || []);

          // AI Tagging & Logging (Server-side Proxy)
          if (user) {
            const traceId = `trace-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const traceData = {
              id: traceId,
              context: { subject, brand, ui_role: uiRole },
              selected_url: data.url,
              decision: data.metadata?.fallback_applied ? "fallback" : "direct_match",
              reason: data.metadata?.reason,
              margin: data.metadata?.margin,
              variance: data.metadata?.variance,
              candidates: data.candidates?.slice(0, 3).map((c: any) => ({ id: c.id, score: c.score, description: c.description }))
            };

            tagAndLogTrace(traceData, data.candidates?.[0]?.description);
          }
        }
      }
    } catch (error: any) {
      if (id === requestId.current) {
        console.error("Error resolving image:", error);
        setSearchError(error instanceof Error ? error.message : "An unexpected error occurred.");
        setResult(null);
      }
    } finally {
      if (id === requestId.current) {
        setLoading(false);
      }
    }
  };

  const runEvaluation = async () => {
    setEvalLoading(true);
    try {
      const response = await fetch("/api/evaluation/run");
      const data = await response.json();
      setEvalData(data);
    } catch (error) {
      console.error("Error running evaluation:", error);
    } finally {
      setEvalLoading(false);
    }
  };

  const tuneWeights = async () => {
    setEvalLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) return;
      const idToken = await user.getIdToken();

      const response = await fetch("/api/evaluation/tune", { 
        method: "POST",
        headers: { "Authorization": `Bearer ${idToken}` }
      });
      const data = await response.json();
      
      if (data.best_weights) {
        // Persist to Firestore from Client
        const configRef = doc(db, "config", "ranking");
        await setDoc(configRef, {
          semantic_weight: data.best_weights.semantic,
          visual_weight: data.best_weights.visual,
          quality_weight: data.best_weights.quality,
          version: `tuned-${Date.now()}`,
          updated_at: new Date().toISOString(),
          updated_by: user.email
        });
        
        alert(`Optimization Complete & Persisted!\nBest Weights: Semantic ${data.best_weights.semantic}, Visual ${data.best_weights.visual}, Quality ${data.best_weights.quality}\nEstimated Improvement: +${(data.improvement * 100).toFixed(1)}%`);
      }
      
      runEvaluation(); // Refresh metrics
    } catch (error) {
      console.error("Error tuning weights:", error);
    } finally {
      setEvalLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "playground" && searchExecuted) {
      resolveImage();
    }
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-orange-500/30">
      {/* Header */}
      <header className="border-b border-white/10 p-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
              <Zap className="text-black fill-current" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">FORGE</h1>
              <p className="text-xs text-white/50 uppercase tracking-widest">Semantic Image Infrastructure</p>
            </div>
            {accumulatedTokens > 0 && (
              <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="hidden md:flex items-center gap-1.5 px-3.5 py-1 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded-full text-[10px] font-mono shadow-[0_0_15px_rgba(168,85,247,0.15)]"
                title="Accumulated tokens processed by Gemini models in this search session"
              >
                <Sparkles size={11} className="text-purple-400" />
                <span className="font-bold">{accumulatedTokens.toLocaleString()} TOKENS</span>
              </motion.div>
            )}
          </div>
          
          <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
            <button 
              onClick={() => setActiveTab("playground")}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${activeTab === "playground" ? "bg-white text-black" : "text-white/40 hover:text-white"}`}
            >
              Playground
            </button>
            <button 
              onClick={() => setActiveTab("evaluation")}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${activeTab === "evaluation" ? "bg-white text-black" : "text-white/40 hover:text-white"}`}
            >
              Evaluation
            </button>
            <button 
              onClick={() => setActiveTab("verification")}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${activeTab === "verification" ? "bg-white text-black" : "text-white/40 hover:text-white"}`}
            >
              Verification
            </button>
          </div>

          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <p className="text-[10px] font-bold uppercase text-white/40 leading-none">Logged in as</p>
                  <p className="text-xs font-medium">{user.email}</p>
                </div>
                <button 
                  onClick={() => signOut()}
                  className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
                  title="Sign Out"
                >
                  <LogOut size={18} className="text-white/60" />
                </button>
              </div>
            ) : (
              <button 
                onClick={() => signInWithGoogle()}
                className="flex items-center gap-2 bg-white text-black px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-orange-500 transition-colors"
              >
                <LogIn size={16} />
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        {activeTab === "playground" ? (
          <div className="space-y-6">
            {!searchExecuted ? (
              /* LANDING SCREEN: Google-style Ambient Dark Search Homepage */
              <motion.div 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="max-w-3xl mx-auto text-center py-16 px-4 space-y-10"
              >
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-full text-xs font-semibold tracking-wider uppercase mb-2">
                    <Sparkles size={12} className="animate-pulse text-orange-500" /> AI-Powered Semantic Ranking Active
                  </div>
                  <h1 className="text-6xl md:text-7xl font-black tracking-tighter bg-gradient-to-r from-white via-neutral-200 to-orange-400 bg-clip-text text-transparent">
                    FORGE
                  </h1>
                  <p className="text-base md:text-lg text-neutral-400 max-w-xl mx-auto leading-relaxed">
                    A unified search index over global creative assets. Enter what you need, specify a brand, and let Gemini align and rank perfect matches on demand.
                  </p>
                </div>

                {/* Main Centered Search Panel */}
                <div className="bg-neutral-900/60 border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl backdrop-blur-md space-y-5 text-left max-w-2xl mx-auto">
                  <div className="relative">
                    <Search className="absolute left-4 top-4 text-neutral-500" size={20} />
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && subject.trim()) resolveImage(); }}
                      className="w-full bg-black/50 border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-base focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 transition-all text-white placeholder-neutral-500"
                      placeholder="What visual are you searching for? (e.g. vintage leather boot)"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                    <div className="sm:col-span-5 space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">Brand Filter (Optional)</label>
                      <input
                        type="text"
                        value={brand}
                        onChange={(e) => setBrand(e.target.value)}
                        className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500/50 transition-all text-white placeholder-neutral-600"
                        placeholder="e.g. Nike, Apple"
                      />
                    </div>
                    <div className="sm:col-span-7 space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">Target UI Role Fit</label>
                      <div className="grid grid-cols-4 gap-1">
                        {["hero", "product", "avatar", "background"].map((role) => (
                          <button
                            key={role}
                            type="button"
                            onClick={() => setUiRole(role)}
                            className={`py-2.5 px-0.5 rounded-xl text-[10px] font-bold uppercase tracking-tight transition-all ${
                              uiRole === role 
                                ? "bg-orange-500 text-black font-extrabold shadow-lg shadow-orange-500/20" 
                                : "bg-black/30 border border-white/5 text-neutral-400 hover:text-white"
                            }`}
                          >
                            {role}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <button
                    id="forge-search-trigger"
                    onClick={resolveImage}
                    disabled={loading || !subject.trim()}
                    className="w-full bg-white text-black hover:bg-orange-500 hover:text-black font-black py-4 px-6 rounded-2xl tracking-wide transition-all flex items-center justify-center gap-2 shadow-xl hover:scale-[1.01] active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
                  >
                    {loading ? <RefreshCw className="animate-spin" size={18} /> : <>Execute Semantic Engine <Sparkles size={16} /></>}
                  </button>
                </div>

                {/* Trending Curated Suggestions */}
                <div className="space-y-3 pt-4">
                  <p className="text-xs text-neutral-500 font-bold uppercase tracking-widest flex items-center justify-center gap-1.5">
                    <Compass size={12} /> Try Curated Semantic Queries
                  </p>
                  <div className="flex flex-wrap justify-center gap-2 max-w-xl mx-auto">
                    {[
                      { s: "Mechanical keyboards with glowing neon backlights", b: "", r: "product" },
                      { s: "Cozy study room with rain tapping on window", b: "", r: "background" },
                      { s: "Minimalist smart sports watch with leather strap", b: "Apple", r: "hero" },
                      { s: "A corporate developer engineer looking at a screen", b: "", r: "avatar" },
                    ].map((prompt, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setSubject(prompt.s);
                          setBrand(prompt.b);
                          setUiRole(prompt.r);
                          setTimeout(() => {
                            resolveImage();
                          }, 50);
                        }}
                        className="px-3.5 py-2 bg-neutral-900 border border-white/5 rounded-full text-xs text-neutral-300 hover:text-white hover:bg-neutral-800 hover:border-orange-500/30 transition-all flex items-center gap-1.5"
                      >
                        <Search size={10} className="text-neutral-500" /> {prompt.s.length > 32 ? prompt.s.slice(0, 32) + "..." : prompt.s}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            ) : (
              /* RESULTS MODE: Google Images Style Dynamic Visual Board */
              <div className="space-y-6">
                {/* DOCKED INLINE SEARCH BAR */}
                <div className="bg-neutral-900/80 border border-white/10 rounded-2xl p-4 shadow-xl backdrop-blur-md flex flex-col md:flex-row items-center gap-4">
                  <button 
                    onClick={() => {
                      setSearchExecuted(false);
                      setResult(null);
                      setSelectedCandidate(null);
                    }}
                    className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-neutral-400 hover:text-white transition-colors self-stretch md:self-auto flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider"
                    title="Back to Landing Page"
                  >
                    <X size={16} /> Home
                  </button>

                  <div className="relative flex-1 w-full">
                    <Search className="absolute left-3.5 top-3.5 text-neutral-500" size={16} />
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && subject.trim()) resolveImage(); }}
                      className="w-full bg-black/40 border border-white/5 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-orange-500/50 transition-all text-white placeholder-neutral-600"
                      placeholder="Refine search subject..."
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    <div className="flex items-center gap-2 bg-black/40 border border-white/5 rounded-xl px-3 py-1.5">
                      <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Brand:</span>
                      <input
                        type="text"
                        value={brand}
                        onChange={(e) => setBrand(e.target.value)}
                        className="bg-transparent border-none p-0 text-xs text-white focus:outline-none w-20 placeholder-neutral-700"
                        placeholder="None"
                      />
                    </div>

                    <div className="flex bg-black/40 border border-white/5 p-0.5 rounded-xl">
                      {["hero", "product", "avatar", "background"].map((role) => (
                        <button
                          key={role}
                          onClick={() => {
                            setUiRole(role);
                            // We can auto-resolve when changing UI roles in the toolbar!
                            setTimeout(() => {
                              resolveImage();
                            }, 50);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                            uiRole === role 
                              ? "bg-orange-500 text-black font-extrabold" 
                              : "text-neutral-400 hover:text-white"
                          }`}
                        >
                          {role}
                        </button>
                      ))}
                    </div>

                    <button
                      id="forge-search-trigger-inline"
                      onClick={resolveImage}
                      disabled={loading || !subject.trim()}
                      className="bg-white hover:bg-orange-500 text-black px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md disabled:opacity-30"
                    >
                      {loading ? <RefreshCw className="animate-spin" size={14} /> : <><RefreshCw size={14} /> Re-rank</>}
                    </button>
                  </div>
                </div>

                {/* DYNAMIC GOOGLE-LIKE FILTERS BAR */}
                <div className="flex flex-wrap items-center justify-between gap-4 py-2 border-b border-white/5">
                  {/* Source Filters */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-neutral-500 uppercase flex items-center gap-1.5">
                      <Filter size={12} /> Providers:
                    </span>
                    <div className="flex items-center gap-1 bg-white/2 p-1 rounded-xl border border-white/5">
                      {[
                        { id: "all", label: "All Assets" },
                        { id: "unsplash", label: "Unsplash" },
                        { id: "wikimedia", label: "Wikimedia Commons" },
                        { id: "openverse", label: "Openverse CC" },
                      ].map((src) => (
                        <button
                          key={src.id}
                          onClick={() => setSourceFilter(src.id as any)}
                          className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${
                            sourceFilter === src.id 
                              ? "bg-white/10 text-white" 
                              : "text-neutral-500 hover:text-neutral-300"
                          }`}
                        >
                          {src.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Right Alignment Controls (Sorting and stats) */}
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-neutral-500 uppercase flex items-center gap-1">
                        <SlidersHorizontal size={12} /> Sort by:
                      </span>
                      <div className="flex bg-white/2 p-0.5 rounded-lg border border-white/5">
                        <button
                          onClick={() => setSortBy("score")}
                          className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider ${sortBy === "score" ? "bg-orange-500/10 text-orange-400 font-extrabold" : "text-neutral-500 hover:text-neutral-300"}`}
                        >
                          Semantic Match
                        </button>
                        <button
                          onClick={() => setSortBy("likes")}
                          className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider ${sortBy === "likes" ? "bg-orange-500/10 text-orange-400 font-extrabold" : "text-neutral-500 hover:text-neutral-300"}`}
                        >
                          Likes Count
                        </button>
                      </div>
                    </div>

                    {result && (
                      <span className="text-[10px] font-mono text-neutral-500 bg-white/5 px-2.5 py-1 rounded-full border border-white/5">
                        {result.candidates?.length || 0} hits • fallback: {result.metadata?.fallback_applied ? "active" : "inactive"}
                      </span>
                    )}
                  </div>
                </div>

                {/* SEARCH RESULTS LAYOUT: GRID & DETAIL SPLIT PANEL */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* LEFT COLUMN: MULTIPLE IMAGE SEARCH RESULTS */}
                  <div className={`${selectedCandidate ? "lg:col-span-8" : "lg:col-span-12"} space-y-4 transition-all duration-300`}>
                    {/* GEMINI INDULGENCE & PAGE QUALITY AUDIT CENTER */}
                    {!loading && (pageAuditLoading || pageAudit) && (
                      <div className="mb-4">
                        {pageAuditLoading ? (
                          <div className="bg-neutral-900/40 border border-white/5 rounded-3xl p-6 space-y-4 animate-pulse">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 animate-pulse">
                                <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center animate-spin">
                                  <RefreshCw size={14} className="text-purple-400" />
                                </div>
                                <div className="space-y-2">
                                  <div className="h-4 w-32 bg-white/10 rounded" />
                                  <div className="h-2.5 w-20 bg-white/5 rounded" />
                                </div>
                              </div>
                              <div className="h-6 w-24 bg-white/10 rounded-full" />
                            </div>
                          </div>
                        ) : pageAudit ? (
                          <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`bg-neutral-900/40 border ${
                              pageAudit.page_status === "mismatch_detected" 
                                ? "border-amber-500/30 shadow-[0_0_25px_rgba(245,158,11,0.06)] bg-gradient-to-br from-neutral-900/80 to-amber-950/10" 
                                : pageAudit.page_status === "fallback_active"
                                ? "border-orange-500/30 shadow-[0_0_25px_rgba(249,115,22,0.06)]"
                                : "border-emerald-500/20 shadow-[0_0_25px_rgba(16,185,129,0.04)]"
                            } rounded-3xl p-6 space-y-6 backdrop-blur-md relative overflow-hidden`}
                          >
                            {/* Background decor */}
                            <div className="absolute right-0 top-0 -mr-12 -mt-12 w-48 h-48 rounded-full bg-purple-500/5 blur-3xl pointer-events-none" />
                            
                            {pageAudit.is_fallback && (
                              <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 text-xs text-amber-400 flex items-start gap-3">
                                <AlertCircle size={16} className="shrink-0 mt-0.5 text-amber-500 animate-pulse" />
                                <div className="space-y-1">
                                  <p className="font-bold uppercase tracking-wider text-[10px]">Gemini API Limit &mdash; Local Resilient Mode Active</p>
                                  <p className="text-neutral-400 leading-relaxed text-[11px]">
                                    Due to the Gemini API free-tier quota (20 req/day limit) or permission restrictions on this workspace project, Forge is running on its <strong>Offline-Resilient Local Heuristic Engine</strong>. Audits and semantic scores are processed locally with zero-latency.
                                  </p>
                                </div>
                              </div>
                            )}

                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/5">
                              <div className="flex items-center gap-3.5">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                  pageAudit.page_status === "mismatch_detected" 
                                    ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" 
                                    : pageAudit.page_status === "fallback_active"
                                    ? "bg-orange-500/10 text-orange-400 border border-orange-500/20"
                                    : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                }`}>
                                  <ShieldCheck size={20} />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-300">Gemini Page-Level Search Quality</h3>
                                    <span className={`text-[9px] font-bold font-mono px-2 py-0.5 rounded-full border ${
                                      pageAudit.page_status === "mismatch_detected"
                                        ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                                        : pageAudit.page_status === "fallback_active"
                                        ? "bg-orange-500/10 border-orange-500/20 text-orange-400 font-bold animate-pulse"
                                        : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                    }`}>
                                      {pageAudit.page_status === "mismatch_detected" 
                                        ? "MISMATCH DETECTED" 
                                        : pageAudit.page_status === "fallback_active"
                                        ? "FALLBACK ACTIVE"
                                        : "OPTIMAL COVERAGE"
                                      }
                                    </span>
                                  </div>
                                  <p className="text-xs text-neutral-500 mt-1">Holistic semantic analysis of top candidates</p>
                                </div>
                              </div>

                              <div className="flex items-center gap-4 self-end md:self-auto">
                                <div className="text-right">
                                  <p className="text-[10px] uppercase font-bold text-neutral-500 leading-none">Semantic Fit</p>
                                  <p className="text-xl font-black font-mono text-white mt-1">{(pageAudit.overall_match_rate * 100).toFixed(0)}%</p>
                                </div>
                                <button
                                  onClick={() => fetchPageStatus(subject, brand, uiRole, result?.candidates || [])}
                                  className="w-9 h-9 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center hover:bg-white/10 transition-colors text-neutral-400 hover:text-white cursor-pointer"
                                  title="Recalculate Whole Page Audit"
                                >
                                  <RefreshCw size={14} className={pageAuditLoading ? "animate-spin" : ""} />
                                </button>
                              </div>
                            </div>

                            {/* Analysis response card */}
                            <div className="space-y-3">
                              <div className="flex items-start gap-2.5 bg-black/30 border border-white/5 rounded-2xl p-4">
                                <MessageSquare size={16} className="text-neutral-500 mt-0.5 shrink-0" />
                                <div className="space-y-1">
                                  <p className="text-xs font-mono text-neutral-400 uppercase tracking-wider">Editorial Assessment</p>
                                  <p className="text-sm text-neutral-200 leading-relaxed font-sans">{pageAudit.editorial_verdict}</p>
                                </div>
                              </div>
                            </div>

                            {/* Gemini Indulgence Section */}
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                <Sparkles size={14} className="text-purple-400 animate-pulse" />
                                <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400">Gemini Mismatch Indulgence & Parameter Tampering</h4>
                              </div>
                              <p className="text-xs text-neutral-400 leading-relaxed">
                                When concept drift or keyword mismatch is identified, the Gemini engine is empowered to "indulge" and tamper with the original query parameters to bypass search limits and source alternative resources:
                              </p>
                              
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                                {pageAudit.indulgence_actions?.map((action: any, idx: number) => (
                                  <div 
                                    key={idx} 
                                    className="bg-black/30 border border-purple-500/10 hover:border-purple-500/25 rounded-2xl p-4.5 space-y-3 transition-all flex flex-col justify-between"
                                  >
                                    <div className="space-y-1.5">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[9px] font-bold font-mono bg-purple-500/10 px-2 py-0.5 rounded text-purple-400 border border-purple-500/15">
                                          PATHWAY {idx + 1}
                                        </span>
                                        {action.suggested_brand && (
                                          <span className="text-[9px] font-mono text-neutral-400 bg-white/5 px-1.5 py-0.5 rounded">
                                            brand: {action.suggested_brand}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-xs text-neutral-300 font-medium leading-relaxed">"{action.reason}"</p>
                                    </div>
                                    <div className="pt-2.5 border-t border-white/5 flex items-center justify-between gap-2">
                                      <span className="text-xs font-mono font-bold text-white truncate max-w-[140px] sm:max-w-[180px]" title={action.suggested_subject}>
                                        {action.suggested_subject}
                                      </span>
                                      <button
                                        onClick={() => {
                                          setSubject(action.suggested_subject);
                                          if (action.suggested_brand !== undefined) {
                                            setBrand(action.suggested_brand);
                                          }
                                          if (action.suggested_ui_role) {
                                            setUiRole(action.suggested_ui_role);
                                          }
                                          // Trigger search in next tick
                                          setTimeout(() => {
                                            const btn = document.getElementById("forge-search-trigger-inline") || document.getElementById("forge-search-trigger");
                                            if (btn) btn.click();
                                          }, 50);
                                        }}
                                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 shadow-md shrink-0 cursor-pointer"
                                      >
                                        Inject & Search
                                        <ChevronRight size={10} />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Alternative Resources pathways */}
                            {pageAudit.alternative_resources && pageAudit.alternative_resources.length > 0 && (
                              <div className="pt-2.5 space-y-2 border-t border-white/5">
                                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                  <Compass size={12} />
                                  <span>Alternative Resource Pathways</span>
                                </div>
                                <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-[11px] text-neutral-500 list-disc list-inside">
                                  {pageAudit.alternative_resources.map((res: string, i: number) => (
                                    <li key={i} className="leading-relaxed hover:text-neutral-400 transition-colors">
                                      {res}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            
                            {/* Token Footprint Footer */}
                            {pageAudit.usage && (
                              <div className="flex justify-between items-center text-[9px] font-mono text-neutral-600 pt-3 border-t border-white/5">
                                <span>AUDIT ENGINE: gemini-3.5-flash</span>
                                <span>PROMPT: {pageAudit.usage.promptTokens}t • RESP: {pageAudit.usage.completionTokens}t • TOTAL: {pageAudit.usage.totalTokens} tokens</span>
                              </div>
                            )}
                          </motion.div>
                        ) : null}
                      </div>
                    )}

                    {loading ? (
                      /* LOADING SKELETON GRID */
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {Array.from({ length: 15 }).map((_, idx) => (
                          <div key={idx} className="aspect-square bg-neutral-900 border border-white/5 rounded-2xl animate-pulse flex items-center justify-center">
                            <ImageIcon className="text-neutral-800 animate-bounce" size={24} />
                          </div>
                        ))}
                      </div>
                    ) : searchError ? (
                      /* SEARCH ERROR SCREEN */
                      <div className="py-20 text-center border border-dashed border-red-500/20 bg-red-500/5 rounded-2xl space-y-4">
                        <AlertCircle className="text-red-500 mx-auto" size={48} />
                        <h3 className="text-lg font-bold text-red-400">Search Engine Error</h3>
                        <p className="text-sm text-neutral-400 max-w-md mx-auto px-4 leading-relaxed">
                          {searchError}
                        </p>
                        {searchError.toLowerCase().includes("api key") && (
                          <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                            Please check that your <strong>GEMINI_API_KEY</strong> is set and active in your workspace <strong>Settings &gt; Secrets</strong>.
                          </p>
                        )}
                      </div>
                    ) : !result || !result.candidates || result.candidates.length === 0 ? (
                      /* NO RESULTS SCREEN */
                      <div className="py-20 text-center border border-dashed border-white/10 rounded-2xl space-y-4">
                        <AlertCircle className="text-neutral-500 mx-auto" size={48} />
                        <h3 className="text-lg font-bold">No Semantic Candidates Found</h3>
                        <p className="text-sm text-neutral-500 max-w-sm mx-auto">
                          Try searching for a broader term or check your internet connection. Some providers may be throttled.
                        </p>
                      </div>
                    ) : (
                      /* IMAGES RESULTS GRID (Google-Images Style) */
                      <div className={`grid grid-cols-2 sm:grid-cols-3 ${selectedCandidate ? "md:grid-cols-3 lg:grid-cols-4" : "md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"} gap-3`}>
                        {result.candidates
                          .filter(c => {
                            if (sourceFilter === "all") return true;
                            return c.source.toLowerCase() === sourceFilter.toLowerCase();
                          })
                          .sort((a, b) => {
                            if (sortBy === "likes") return (b.likes || 0) - (a.likes || 0);
                            return (b.score || 0) - (a.score || 0);
                          })
                          .map((img, index) => {
                            const isSelected = selectedCandidate?.id === img.id;
                            const isWinner = img.url === result.url;

                            return (
                              <motion.div
                                key={img.id}
                                layoutId={`card-${img.id}`}
                                onClick={() => setSelectedCandidate(img)}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                className={`relative group cursor-pointer overflow-hidden rounded-xl bg-neutral-900/60 border transition-all ${
                                  isSelected 
                                    ? "border-orange-500 ring-2 ring-orange-500/20" 
                                    : "border-white/5 hover:border-white/20"
                                }`}
                              >
                                {/* Candidate Aspect Wrapper based on UI role */}
                                <div className={`w-full relative bg-neutral-950 overflow-hidden ${
                                  uiRole === 'avatar' 
                                    ? 'aspect-square rounded-full mx-auto max-w-[85%]' 
                                    : uiRole === 'hero' 
                                      ? 'aspect-video' 
                                      : 'aspect-square'
                                }`}>
                                  <img
                                    src={img.url}
                                    alt={img.description}
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                    referrerPolicy="no-referrer"
                                    loading="lazy"
                                  />

                                  {/* Score Badge (Top Left) */}
                                  <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 bg-black/70 backdrop-blur-md rounded text-[9px] font-extrabold text-orange-400 border border-orange-500/20">
                                    <Target size={8} />
                                    <span>{(img.score ? (img.score * 100).toFixed(0) : "N/A")}%</span>
                                  </div>

                                  {/* TOP RESOLVED MATCH Badge (Top Right) */}
                                  {isWinner && (
                                    <div className="absolute top-2 right-2 flex items-center gap-0.5 px-2 py-0.5 bg-amber-500 text-black rounded text-[8px] font-black uppercase tracking-wider shadow-lg shadow-amber-500/20">
                                      <Award size={8} /> Win
                                    </div>
                                  )}

                                  {/* Source provider tag bottom left on card */}
                                  <span className={`absolute bottom-2 left-2 text-[8px] font-black uppercase px-1.5 py-0.5 rounded backdrop-blur-md ${
                                    img.source === 'unsplash' ? 'bg-indigo-500/20 text-indigo-300' :
                                    img.source === 'wikimedia' ? 'bg-green-500/20 text-green-300' :
                                    'bg-rose-500/20 text-rose-300'
                                  }`}>
                                    {img.source}
                                  </span>
                                </div>

                                {/* Metadata Info Box */}
                                <div className="p-2 space-y-0.5 bg-black/40 border-t border-white/5">
                                  <p className="text-[11px] font-bold text-neutral-200 truncate pr-4">
                                    {img.description || "Image Candidate"}
                                  </p>
                                  <div className="flex items-center justify-between text-[9px] text-neutral-500">
                                    <span className="truncate max-w-[70%]">@{img.attribution.photographer || "Creator"}</span>
                                    <span className="font-mono">{img.width}x{img.height}</span>
                                  </div>
                                </div>
                              </motion.div>
                            );
                          })}
                      </div>
                    )}
                  </div>

                  {/* RIGHT COLUMN: DETAILED GOOGLE IMAGES STYLE INSPECTOR SIDEBAR */}
                  <AnimatePresence>
                    {selectedCandidate && (
                      <motion.div
                        initial={{ opacity: 0, x: 50, scale: 0.98 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 50, scale: 0.98 }}
                        transition={{ type: "spring", stiffness: 300, damping: 25 }}
                        className="lg:col-span-4 bg-neutral-950 border border-white/10 rounded-2xl p-5 sticky top-6 max-h-[85vh] overflow-y-auto space-y-6 shadow-2xl"
                      >
                        {/* Detail Header Controls */}
                        <div className="flex items-center justify-between pb-3 border-b border-white/5">
                          <h3 className="text-xs font-extrabold uppercase tracking-widest text-neutral-400 flex items-center gap-1.5">
                            <Eye size={12} className="text-orange-500" /> Asset Inspector
                          </h3>
                          <button
                            onClick={() => setSelectedCandidate(null)}
                            className="p-1 hover:bg-white/10 rounded-lg text-neutral-500 hover:text-white transition-colors"
                            title="Close Inspector"
                          >
                            <X size={18} />
                          </button>
                        </div>

                        {/* HD Preview Container */}
                        <div className="space-y-3">
                          <div className={`relative overflow-hidden bg-black border border-white/10 ${
                            uiRole === 'avatar' 
                              ? 'aspect-square rounded-full mx-auto max-w-[75%]' 
                              : uiRole === 'hero' 
                                ? 'aspect-video rounded-xl' 
                                : 'aspect-square rounded-xl'
                          }`}>
                            <img
                              src={selectedCandidate.url}
                              alt={selectedCandidate.description}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                            {selectedCandidate.url === result?.url && (
                              <div className="absolute bottom-3 right-3 px-2.5 py-1 bg-amber-500 text-black text-[9px] font-black uppercase rounded shadow-lg flex items-center gap-1">
                                <Award size={10} /> Golden Resolved Choice
                              </div>
                            )}
                          </div>

                          <div className="flex items-center justify-between text-xs text-neutral-400 bg-white/2 px-3 py-2 rounded-xl border border-white/5">
                            <span className="font-medium truncate">By {selectedCandidate.attribution.photographer}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono">{selectedCandidate.width} × {selectedCandidate.height}</span>
                              <a 
                                href={selectedCandidate.attribution.license_url} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="text-neutral-400 hover:text-white flex items-center gap-1"
                              >
                                <ExternalLink size={12} />
                              </a>
                            </div>
                          </div>
                        </div>

                        {/* Match Status Cards Grid */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-neutral-900 border border-white/5 rounded-xl p-3 text-center space-y-1">
                            <p className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Semantic Rank</p>
                            <p className="text-xl font-black text-orange-400">
                              {selectedCandidate.score ? `${(selectedCandidate.score * 100).toFixed(1)}%` : "N/A"}
                            </p>
                          </div>
                          <div className="bg-neutral-900 border border-white/5 rounded-xl p-3 text-center space-y-1">
                            <p className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Sourced Index</p>
                            <p className="text-xs font-black uppercase text-indigo-400 py-1">
                              {selectedCandidate.source}
                            </p>
                          </div>
                        </div>

                        {/* Interactive Gemini AI Semantic Tagging Report */}
                        <div className="border border-white/10 rounded-xl p-4 bg-neutral-900/40 space-y-4">
                          <div className="flex items-center justify-between pb-2 border-b border-white/5">
                            <h4 className="text-[10px] font-black uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                              <Sparkles size={12} className="text-orange-500" /> Real-Time Gemini Verification
                            </h4>
                            <span className="text-[8px] font-bold text-neutral-500 bg-white/5 px-2 py-0.5 rounded">
                              Live Tagging
                            </span>
                          </div>

                          {candidateTaggingLoading ? (
                            <div className="py-8 text-center space-y-3">
                              <RefreshCw className="animate-spin text-orange-500 mx-auto" size={24} />
                              <p className="text-[10px] text-neutral-400 font-mono animate-pulse">
                                Gemini is analyzing subjects & safety...
                              </p>
                            </div>
                          ) : candidateTaggingError ? (
                            <div className="py-6 text-center space-y-3">
                              <AlertCircle className="text-orange-500 mx-auto" size={24} />
                              <p className="text-[11px] text-neutral-300 font-medium px-2">
                                {candidateTaggingError}
                              </p>
                              {candidateTaggingError.toLowerCase().includes("api key") && (
                                <p className="text-[9px] text-neutral-500 max-w-[220px] mx-auto leading-normal">
                                  You can add your key in the <strong>Settings &gt; Secrets</strong> panel of the AI Studio workspace.
                                </p>
                              )}
                            </div>
                          ) : selectedCandidateTags ? (
                            <div className="space-y-4">
                              {selectedCandidateTags.is_fallback && (
                                <div className="bg-amber-500/5 border border-amber-500/10 rounded-lg p-2.5 text-[10px] text-amber-400 flex items-start gap-2">
                                  <AlertCircle size={13} className="shrink-0 mt-0.5 text-amber-500" />
                                  <div>
                                    <span className="font-bold block mb-0.5 uppercase tracking-wider text-[9px]">Local Heuristic Tagging Active</span>
                                    <span className="text-neutral-400 leading-normal">
                                      API limit reached. Image attributes were parsed offline using local heuristic classifiers.
                                    </span>
                                  </div>
                                </div>
                              )}
                              {/* Subjects */}
                              <div className="space-y-1">
                                <span className="text-[9px] font-bold text-neutral-500 uppercase">Recognized Subjects:</span>
                                <div className="flex flex-wrap gap-1">
                                  {selectedCandidateTags.subject && selectedCandidateTags.subject.length > 0 ? (
                                    selectedCandidateTags.subject.map((s: string) => (
                                      <span key={s} className="text-[9px] bg-white/5 border border-white/10 text-neutral-300 px-2 py-0.5 rounded">
                                        {s}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-[9px] text-neutral-600">None detected</span>
                                  )}
                                </div>
                              </div>

                              {/* Brand Security */}
                              <div className="flex items-center justify-between bg-black/40 p-2.5 rounded-lg border border-white/5">
                                <span className="text-[9px] font-bold text-neutral-500 uppercase">Visible Brand Logo:</span>
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded ${
                                  selectedCandidateTags.brand 
                                    ? "bg-blue-500/10 text-blue-400" 
                                    : "bg-green-500/10 text-green-400"
                                }`}>
                                  {selectedCandidateTags.brand || "Brand Safe"}
                                </span>
                              </div>

                              {/* UI Fitness Roles */}
                              <div className="space-y-1">
                                <span className="text-[9px] font-bold text-neutral-500 uppercase">Recommended UI Fits:</span>
                                <div className="flex flex-wrap gap-1">
                                  {selectedCandidateTags.ui_role_fit?.map((role: string) => (
                                    <span key={role} className="text-[9px] bg-orange-500/10 text-orange-400 px-2 py-0.5 rounded font-medium">
                                      {role}
                                    </span>
                                  ))}
                                </div>
                              </div>

                              {/* Composition layout notes */}
                              <div className="space-y-1.5">
                                <span className="text-[9px] font-bold text-neutral-500 uppercase">Visual Composition:</span>
                                <div className="flex flex-wrap gap-1">
                                  {selectedCandidateTags.composition?.map((comp: string) => (
                                    <span key={comp} className="text-[9px] text-neutral-400 bg-white/2 border border-white/5 px-2 py-0.5 rounded font-medium">
                                      {comp}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="py-4 text-center">
                              <p className="text-[10px] text-neutral-500">
                                Click an asset to request real-time Gemini tagging.
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Interactive Gemini AI Image-to-Query Auditor */}
                        <div className="border border-white/10 rounded-xl p-4 bg-neutral-900/40 space-y-4">
                          <div className="flex items-center justify-between pb-2 border-b border-white/5">
                            <h4 className="text-[10px] font-black uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                              <ShieldCheck size={12} className="text-emerald-500" /> Gemini Mismatch Audit
                            </h4>
                            <span className="text-[8px] font-bold text-neutral-500 bg-white/5 px-2 py-0.5 rounded">
                              Vision Audit
                            </span>
                          </div>

                          {candidateAuditLoading ? (
                            <div className="py-8 text-center space-y-3">
                              <RefreshCw className="animate-spin text-orange-500 mx-auto" size={24} />
                              <p className="text-[10px] text-neutral-400 font-mono animate-pulse">
                                Gemini is verifying image content against search intent...
                              </p>
                            </div>
                          ) : candidateAuditError ? (
                            <div className="py-6 text-center space-y-2">
                              <AlertCircle className="text-red-500 mx-auto" size={24} />
                              <p className="text-[11px] text-neutral-300 font-medium px-2">
                                {candidateAuditError}
                              </p>
                            </div>
                          ) : selectedCandidateAudit ? (
                            <div className="space-y-4">
                              {selectedCandidateAudit.is_fallback && (
                                <div className="bg-amber-500/5 border border-amber-500/10 rounded-lg p-2.5 text-[10px] text-amber-400 flex items-start gap-2">
                                  <AlertCircle size={13} className="shrink-0 mt-0.5 text-amber-500" />
                                  <div>
                                    <span className="font-bold block mb-0.5 uppercase tracking-wider text-[9px]">Local Heuristic Audit Active</span>
                                    <span className="text-neutral-400 leading-normal">
                                      API limit reached. Image verification and object maps were generated locally via heuristic term-overlap checks.
                                    </span>
                                  </div>
                                </div>
                              )}
                              {/* Verdict Header Badge */}
                              <div className={`p-3 rounded-xl border flex items-start gap-3 ${
                                selectedCandidateAudit.is_mismatch 
                                  ? "bg-red-500/10 border-red-500/20 text-red-200" 
                                  : "bg-emerald-500/10 border-emerald-500/20 text-emerald-200"
                              }`}>
                                {selectedCandidateAudit.is_mismatch ? (
                                  <AlertCircle className="text-red-400 mt-0.5 shrink-0" size={16} />
                                ) : (
                                  <CheckCircle2 className="text-emerald-400 mt-0.5 shrink-0" size={16} />
                                )}
                                <div className="space-y-1">
                                  <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                                    Audit Verdict
                                  </p>
                                  <p className="text-xs font-bold leading-normal">
                                    {selectedCandidateAudit.audit_verdict}
                                  </p>
                                </div>
                              </div>

                              {/* Explanation Analysis */}
                              <div className="space-y-1 bg-black/20 p-3 rounded-lg border border-white/5">
                                <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider block">Multimodal Analysis:</span>
                                <p className="text-xs text-neutral-300 leading-relaxed font-sans">
                                  {selectedCandidateAudit.explanation}
                                </p>
                              </div>

                              {/* Detected visual elements */}
                              {selectedCandidateAudit.detected_objects && selectedCandidateAudit.detected_objects.length > 0 && (
                                <div className="space-y-1">
                                  <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider block">Detected Objects/Themes:</span>
                                  <div className="flex flex-wrap gap-1">
                                    {selectedCandidateAudit.detected_objects.map((obj: string) => (
                                      <span key={obj} className="text-[9px] bg-white/5 border border-white/10 text-neutral-300 px-2 py-0.5 rounded font-mono">
                                        {obj}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Smart Query Suggestions */}
                              {selectedCandidateAudit.suggestions && selectedCandidateAudit.suggestions.length > 0 && (
                                <div className="space-y-2">
                                  <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider block">Smart Engine Corrections:</span>
                                  <div className="grid grid-cols-1 gap-1.5">
                                    {selectedCandidateAudit.suggestions.map((sug: string, i: number) => (
                                      <button
                                        key={i}
                                        onClick={() => {
                                          setSubject(sug);
                                        }}
                                        className="text-left text-[10px] bg-neutral-950 hover:bg-orange-500/10 hover:text-orange-400 border border-white/5 hover:border-orange-500/20 rounded-lg p-2 transition-all flex items-center justify-between group"
                                        title="Click to search this refined term"
                                      >
                                        <span className="text-neutral-300 group-hover:text-orange-300 font-medium truncate max-w-[85%]">
                                          {sug}
                                        </span>
                                        <span className="text-[8px] font-black uppercase tracking-wider text-orange-500/70 group-hover:text-orange-400 shrink-0 font-mono flex items-center gap-0.5">
                                          Refine <ChevronRight size={8} />
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="py-4 text-center">
                              <p className="text-[10px] text-neutral-500">
                                Click an asset to audit match accuracy.
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Download Original and attribution */}
                        <a
                          href={selectedCandidate.url}
                          target="_blank"
                          rel="noreferrer"
                          className="w-full bg-white text-black hover:bg-orange-500 hover:text-black font-extrabold py-3 px-4 rounded-xl text-xs tracking-wider transition-all flex items-center justify-center gap-2"
                        >
                          <Download size={14} /> Open Original Full-Res Image
                        </a>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Evaluation Dashboard</h2>
                <p className="text-white/40 text-sm">Quantifying ranking quality across the Golden Dataset.</p>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={tuneWeights}
                  disabled={evalLoading}
                  className="bg-white/5 text-white/60 font-bold px-6 py-3 rounded-xl flex items-center gap-2 hover:bg-white/10 transition-all disabled:opacity-50 border border-white/10"
                >
                  {evalLoading ? <RefreshCw className="animate-spin" size={18} /> : <Zap size={18} />}
                  Auto-Tune Weights
                </button>
                <button 
                  onClick={runEvaluation}
                  disabled={evalLoading}
                  className="bg-orange-500 text-black font-bold px-6 py-3 rounded-xl flex items-center gap-2 hover:bg-orange-400 transition-all disabled:opacity-50"
                >
                  {evalLoading ? <RefreshCw className="animate-spin" size={18} /> : <Target size={18} />}
                  Run Evaluation
                </button>
              </div>
            </div>

            {evalData ? (
              <div className="space-y-8">
                {/* Metrics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                    <BarChart3 className="text-orange-500 mb-4" size={24} />
                    <p className="text-[10px] font-bold text-white/30 uppercase mb-1">Overall Accuracy</p>
                    <div className="flex items-baseline gap-2">
                      <p className="text-3xl font-bold">{(evalData.metrics.overall_accuracy * 100).toFixed(1)}%</p>
                      <p className="text-[10px] text-white/40">Test: {(evalData.metrics.test_accuracy * 100).toFixed(0)}%</p>
                    </div>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                    <AlertCircle className="text-red-500 mb-4" size={24} />
                    <p className="text-[10px] font-bold text-white/30 uppercase mb-1">Expected Loss</p>
                    <p className="text-3xl font-bold">{evalData.metrics.expected_loss.toFixed(2)}</p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                    <ShieldCheck className="text-green-500 mb-4" size={24} />
                    <p className="text-[10px] font-bold text-white/30 uppercase mb-1">Retrieval Health</p>
                    <p className="text-3xl font-bold">{(evalData.metrics.retrieval_health * 100).toFixed(1)}%</p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                    <Target className="text-blue-500 mb-4" size={24} />
                    <p className="text-[10px] font-bold text-white/30 uppercase mb-1">Ranking Efficiency</p>
                    <p className="text-3xl font-bold">{(evalData.metrics.ranking_efficiency * 100).toFixed(1)}%</p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                    <CheckCircle2 className="text-purple-500 mb-4" size={24} />
                    <p className="text-[10px] font-bold text-white/30 uppercase mb-1">High Conf Accuracy</p>
                    <p className="text-3xl font-bold">{(evalData.metrics.accuracy_by_confidence.high.accuracy * 100).toFixed(1)}%</p>
                  </div>
                </div>

                {/* Secondary Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Failure Modes */}
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-white/40 mb-6 flex items-center gap-2">
                      <AlertCircle size={14} /> Failure Mode Breakdown
                    </h3>
                    <div className="space-y-4">
                      {Object.entries(evalData.metrics.failure_modes).map(([mode, count]) => (
                        <div key={mode} className="flex items-center justify-between">
                          <span className="text-sm text-white/60 capitalize">{mode.replace("_", " ")}</span>
                          <div className="flex items-center gap-3">
                            <div className="w-32 bg-white/5 h-1.5 rounded-full overflow-hidden">
                              <div 
                                className="bg-orange-500 h-full" 
                                style={{ width: `${((count as number) / evalData.results.length) * 100}%` }} 
                              />
                            </div>
                            <span className="text-xs font-mono w-8 text-right">{count as number}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Calibration Table */}
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-white/40 mb-6 flex items-center gap-2">
                      <Target size={14} /> Confidence Calibration
                    </h3>
                    <div className="space-y-4">
                      {Object.entries(evalData.metrics.accuracy_by_confidence).map(([bucket, data]) => {
                        const d = data as { accuracy: number; count: number };
                        return (
                          <div key={bucket} className="flex items-center justify-between">
                            <span className="text-sm text-white/60 capitalize">{bucket}</span>
                            <div className="flex items-center gap-4">
                              <span className="text-xs text-white/30">{d.count} samples</span>
                              <span className={`text-sm font-bold ${d.accuracy > 0.8 ? 'text-green-500' : 'text-yellow-500'}`}>
                                {(d.accuracy * 100).toFixed(0)}% Acc
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Results Table */}
                <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-white/5 border-b border-white/10">
                        <th className="p-4 text-[10px] font-bold uppercase text-white/40">Test Case</th>
                        <th className="p-4 text-[10px] font-bold uppercase text-white/40">Confidence</th>
                        <th className="p-4 text-[10px] font-bold uppercase text-white/40">Accuracy</th>
                        <th className="p-4 text-[10px] font-bold uppercase text-white/40">Failure Mode / Fix</th>
                        <th className="p-4 text-[10px] font-bold uppercase text-white/40">Safety</th>
                        <th className="p-4 text-[10px] font-bold uppercase text-white/40">Visual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {evalData.results.map((res) => (
                        <tr key={res.case_id} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold">{res.case_name}</p>
                              {res.is_test_set && <span className="text-[8px] bg-blue-500/20 text-blue-400 px-1 rounded">TEST</span>}
                              {res.is_near_miss && (
                                <span className="text-[8px] bg-yellow-500/20 text-yellow-400 px-1 rounded" title={res.near_miss_type}>
                                  NEAR MISS
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-white/40 font-mono">{res.case_id}</p>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${res.score > 0.8 ? 'bg-green-500' : 'bg-yellow-500'}`} />
                              <span className="text-sm font-mono">{(res.score * 100).toFixed(0)}%</span>
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                              <div className="bg-orange-500 h-full" style={{ width: `${res.trait_accuracy * 100}%` }} />
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="flex flex-col gap-1">
                              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded w-fit ${res.failure_mode === 'none' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                {res.failure_mode.replace("_", " ")}
                              </span>
                              {res.failure_mode !== 'none' && (
                                <p className="text-[9px] text-white/40 italic">{res.recommended_fix}</p>
                              )}
                            </div>
                          </td>
                          <td className="p-4">
                            {res.is_brand_safe ? <CheckCircle2 size={16} className="text-green-500" /> : <AlertCircle size={16} className="text-red-500" />}
                          </td>
                          <td className="p-4">
                            <img src={res.url} className="w-12 h-12 object-cover rounded border border-white/10" referrerPolicy="no-referrer" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="h-[400px] border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center gap-4 text-white/20">
                <Target size={48} />
                <p className="text-sm font-medium">No evaluation data. Run a test to see metrics.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "verification" && (
          <VerificationTab user={user} />
        )}
      </main>
    </div>
  );
}

function VerificationTab({ user }: { user: User | null }) {
  const [traces, setTraces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [labels, setLabels] = useState<VerificationLabels>({
    subject_correct: true,
    brand_correct: true,
    composition_correct: true,
    ui_fit_correct: true,
    notes: ""
  });

  const loadTraces = async () => {
    setLoading(true);
    const data = await fetchTraces(20);
    setTraces(data);
    setLoading(false);
  };

  useEffect(() => {
    if (user) {
      loadTraces();
    } else {
      setTraces([]);
    }
  }, [user]);

  const handleVerify = async (traceId: string, quickLabels?: VerificationLabels) => {
    if (!user) {
      signInWithGoogle();
      return;
    }
    const trace = traces.find(t => t.id === traceId);
    await saveVerification(traceId, quickLabels || labels, trace?.ai_tags);
    setVerifyingId(null);
    loadTraces(); // Refresh
  };

  if (!user) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-6 text-center">
        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center">
          <ShieldCheck size={32} className="text-white/20" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold">Authentication Required</h2>
          <p className="text-sm text-white/40 max-w-xs mx-auto">
            You must be signed in to access the ground-truth verification engine.
          </p>
        </div>
        <button 
          onClick={() => signInWithGoogle()}
          className="flex items-center gap-2 bg-white text-black px-6 py-3 rounded-xl text-sm font-bold uppercase tracking-wider hover:bg-orange-500 transition-all"
        >
          <LogIn size={18} />
          Sign In with Google
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Verification Engine</h2>
          <p className="text-sm text-white/40">Convert AI guesses into high-quality ground-truth labels.</p>
        </div>
        <button 
          onClick={loadTraces}
          className="p-2 hover:bg-white/5 rounded-lg transition-colors"
          title="Refresh Traces"
        >
          <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-64 bg-white/5 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : traces.length === 0 ? (
        <div className="h-[40vh] border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center gap-4 text-white/20">
          <MessageSquare size={48} />
          <p className="text-sm font-medium">No traces found. Run some resolutions in the Playground first.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {traces.map((trace) => (
            <motion.div 
              key={trace.id}
              layout
              className={`bg-white/5 border rounded-2xl overflow-hidden flex flex-col transition-colors ${trace.ai_tags?.confidence < 0.5 ? 'border-orange-500/50 bg-orange-500/5' : 'border-white/10'}`}
            >
              <div className="aspect-video relative group">
                <img 
                  src={trace.selected_url} 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-4 text-center">
                  <p className="text-xs font-medium">{trace.context.subject}</p>
                </div>
                {trace.ai_tags?.confidence < 0.5 && (
                  <div className="absolute top-2 right-2 bg-orange-500 text-black text-[8px] font-black uppercase px-1.5 py-0.5 rounded flex items-center gap-1">
                    <AlertCircle size={10} />
                    Low Confidence
                  </div>
                )}
              </div>

              <div className="p-4 space-y-4 flex-1">
                <div className="flex items-center justify-between">
                  <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded ${trace.decision === 'direct_match' ? 'bg-green-500/20 text-green-500' : 'bg-orange-500/20 text-orange-500'}`}>
                    {trace.decision.replace("_", " ")}
                  </span>
                  <span className="text-[9px] font-mono text-white/30">{new Date(trace.timestamp).toLocaleTimeString()}</span>
                </div>

                {trace.ai_tags && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-white/30 uppercase">AI Guesses</p>
                    <div className="flex flex-wrap gap-1">
                      {trace.ai_tags.subject.map((s: string) => (
                        <span key={s} className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded">{s}</span>
                      ))}
                      {trace.ai_tags.brand && (
                        <span className="text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">{trace.ai_tags.brand}</span>
                      )}
                    </div>
                  </div>
                )}

                {verifyingId === trace.id ? (
                  <div className="space-y-3 pt-2 border-t border-white/10">
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { key: 'subject_correct', label: 'Subject' },
                        { key: 'brand_correct', label: 'Brand' },
                        { key: 'composition_correct', label: 'Comp' },
                        { key: 'ui_fit_correct', label: 'UI Fit' }
                      ].map(item => (
                        <button
                          key={item.key}
                          onClick={() => setLabels(prev => ({ ...prev, [item.key]: !prev[item.key as keyof VerificationLabels] }))}
                          className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${labels[item.key as keyof VerificationLabels] ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}
                        >
                          {item.label}
                          {labels[item.key as keyof VerificationLabels] ? <Check size={12} /> : <X size={12} />}
                        </button>
                      ))}
                    </div>
                    <input 
                      type="text"
                      placeholder="Add notes..."
                      value={labels.notes}
                      onChange={(e) => setLabels(prev => ({ ...prev, notes: e.target.value }))}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-[10px] focus:outline-none focus:border-white/30"
                    />
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleVerify(trace.id)}
                        className="flex-1 bg-white text-black py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-orange-500 transition-colors"
                      >
                        Save Labels
                      </button>
                      <button 
                        onClick={() => setVerifyingId(null)}
                        className="px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-[10px] font-bold uppercase transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 mt-2">
                    <button 
                      onClick={() => {
                        setVerifyingId(trace.id);
                        setLabels({
                          subject_correct: true,
                          brand_correct: true,
                          composition_correct: true,
                          ui_fit_correct: true,
                          notes: ""
                        });
                      }}
                      className="flex-1 py-2 border border-white/10 rounded-xl text-[10px] font-bold uppercase tracking-wider hover:bg-white hover:text-black transition-all flex items-center justify-center gap-2"
                    >
                      Verify
                    </button>
                    <button 
                      onClick={() => handleVerify(trace.id, {
                        subject_correct: true,
                        brand_correct: true,
                        composition_correct: true,
                        ui_fit_correct: true,
                        notes: "Quick verify"
                      })}
                      className="px-3 py-2 bg-green-500/10 text-green-500 border border-green-500/20 rounded-xl text-[10px] font-bold uppercase hover:bg-green-500 hover:text-black transition-all"
                      title="All Correct"
                    >
                      <Check size={14} />
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
