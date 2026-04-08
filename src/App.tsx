import { useState, useEffect, useRef } from "react";
import { Search, Image as ImageIcon, ShieldCheck, Zap, Info, ExternalLink, RefreshCw, BarChart3, CheckCircle2, AlertCircle, Target, Check, X, MessageSquare, LogIn, LogOut, User as UserIcon } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { auth, signInWithGoogle, signOut } from "./lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
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
  const [subject, setSubject] = useState("Nike running shoes");
  const [brand, setBrand] = useState("Nike");
  const [uiRole, setUiRole] = useState("hero");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ForgeResponse | null>(null);
  
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalData, setEvalData] = useState<EvaluationData | null>(null);

  // Race condition protection
  const requestId = useRef(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  const resolveImage = async () => {
    const id = ++requestId.current;
    setLoading(true);
    
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
        setResult(data);

        // AI Tagging & Logging (Server-side Proxy)
        if (user) {
          const traceId = `trace-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const traceData = {
            id: traceId,
            context: { subject, brand, ui_role: uiRole },
            selected_url: data.url,
            decision: data.metadata.fallback_applied ? "fallback" : "direct_match",
            reason: data.metadata.reason,
            margin: data.metadata.margin,
            variance: data.metadata.variance,
            candidates: data.candidates?.slice(0, 3).map((c: any) => ({ id: c.id, score: c.score, description: c.description }))
          };

          tagAndLogTrace(traceData, data.candidates?.[0]?.description);
        }
      }
    } catch (error) {
      if (id === requestId.current) {
        console.error("Error resolving image:", error);
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
    if (activeTab === "playground") {
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
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Controls */}
            <div className="lg:col-span-4 space-y-6">
              <section className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-6">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-white/40 flex items-center gap-2">
                  <Search size={14} /> Semantic Context
                </h2>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-white/60">Subject</label>
                    <input 
                      type="text" 
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500 transition-colors"
                      placeholder="e.g. Running shoes"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-white/60">Brand (Optional)</label>
                    <input 
                      type="text" 
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                      className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500 transition-colors"
                      placeholder="e.g. Nike"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-white/60">UI Role</label>
                    <div className="grid grid-cols-2 gap-2">
                      {["hero", "product", "avatar", "background"].map((role) => (
                        <button
                          key={role}
                          onClick={() => setUiRole(role)}
                          className={`px-4 py-2 rounded-lg text-xs font-medium capitalize transition-all ${
                            uiRole === role 
                              ? "bg-orange-500 text-black" 
                              : "bg-white/5 text-white/60 hover:bg-white/10"
                          }`}
                        >
                          {role}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button 
                    onClick={resolveImage}
                    disabled={loading}
                    className="w-full bg-white text-black font-bold py-4 rounded-xl hover:bg-orange-500 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {loading ? <RefreshCw className="animate-spin" size={18} /> : "Resolve Image"}
                  </button>
                </div>
              </section>

              <section className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-6">
                <div className="flex items-start gap-3">
                  <Info className="text-orange-500 shrink-0" size={18} />
                  <p className="text-sm text-orange-200/80 leading-relaxed">
                    Forge uses a hierarchical fallback system. If an exact brand match isn't found, it degrades gracefully to category-level visuals while maintaining brand safety.
                  </p>
                </div>
              </section>
            </div>

            {/* Preview */}
            <div className="lg:col-span-8 space-y-6">
              <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden min-h-[500px] flex flex-col">
                <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/2">
                  <div className="flex items-center gap-2">
                    <ImageIcon size={16} className="text-white/40" />
                    <span className="text-xs font-medium text-white/60 uppercase tracking-widest">Visual Output</span>
                  </div>
                  {result && (
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${result.confidence > 0.7 ? 'bg-green-500' : 'bg-yellow-500'}`} />
                        <span className="text-[10px] font-bold uppercase text-white/40">Confidence: {(result.confidence * 100).toFixed(0)}%</span>
                      </div>
                      <div className="px-2 py-0.5 bg-white/10 rounded text-[10px] font-bold uppercase text-white/60">
                        Match: {result.match_level}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex-1 relative flex items-center justify-center p-8">
                  <AnimatePresence mode="wait">
                    {loading ? (
                      <motion.div 
                        key="loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex flex-col items-center gap-4"
                      >
                        <RefreshCw className="animate-spin text-orange-500" size={48} />
                        <p className="text-sm text-white/40 font-mono">Resolving semantic intent...</p>
                      </motion.div>
                    ) : result ? (
                      <motion.div 
                        key="result"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="w-full h-full flex flex-col items-center justify-center gap-6"
                      >
                        <div className={`relative group overflow-hidden border border-white/10 shadow-2xl ${
                          uiRole === 'avatar' 
                            ? 'w-64 h-64 rounded-full' 
                            : uiRole === 'hero'
                              ? 'w-full max-w-2xl aspect-video rounded-2xl'
                              : 'w-full max-w-md aspect-square rounded-2xl'
                        }`}>
                          <img 
                            src={result.url} 
                            alt={result.metadata.alt_text}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                          {result.metadata.fallback_applied && (
                            <div className="absolute top-4 right-4 px-3 py-1 bg-black/60 backdrop-blur-md border border-white/10 rounded-full text-[10px] font-bold uppercase tracking-wider">
                              Fallback Applied
                            </div>
                          )}
                        </div>

                        {result.attribution && (
                          <div className="flex items-center gap-2 text-xs text-white/40">
                            <span>Photo by {result.attribution.photographer} on {result.attribution.service}</span>
                            <a href={result.attribution.license_url} target="_blank" rel="noreferrer" className="hover:text-white">
                              <ExternalLink size={12} />
                            </a>
                          </div>
                        )}
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              </div>

              {/* Metadata Grid */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-white/30 uppercase mb-1">Match Level</p>
                  <p className="text-sm font-medium capitalize">{result?.match_level || "---"}</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-white/30 uppercase mb-1">Margin</p>
                  <p className="text-sm font-mono">{result?.metadata.margin !== undefined ? `${(result.metadata.margin * 100).toFixed(1)}%` : "---"}</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-white/30 uppercase mb-1">Contribution</p>
                  <div className="flex gap-2 mt-1">
                    {result?.metadata.contribution ? (
                      <>
                        <span className="text-[9px] bg-white/10 px-1 rounded" title="Semantic">S: {(result.metadata.contribution.semantic * 100).toFixed(0)}%</span>
                        <span className="text-[9px] bg-white/10 px-1 rounded" title="Visual">V: {(result.metadata.contribution.visual * 100).toFixed(0)}%</span>
                        <span className="text-[9px] bg-white/10 px-1 rounded" title="Quality">Q: {(result.metadata.contribution.quality * 100).toFixed(0)}%</span>
                      </>
                    ) : "---"}
                  </div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-white/30 uppercase mb-1">
                    {result?.metadata.fallback_applied ? "Fallback Reason" : "Confidence"}
                  </p>
                  <p className={`text-sm font-medium ${result?.metadata.fallback_applied ? "text-orange-400" : "text-green-500"}`}>
                    {result?.metadata.fallback_applied 
                      ? (result.metadata.reason?.replace("_", " ") || "low signal")
                      : `${(result?.confidence * 100).toFixed(1)}%`
                    }
                  </p>
                </div>
              </div>

              {/* Semantic Analysis Report */}
              <AnimatePresence>
                {result?.semantic_report && (
                  <motion.section 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-6"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold uppercase tracking-widest text-white/40 flex items-center gap-2">
                        <BarChart3 size={14} /> Real-Time Semantic Analysis
                      </h3>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-white/30 uppercase">AI Confidence</span>
                        <div className="w-24 bg-white/10 h-1.5 rounded-full overflow-hidden">
                          <div 
                            className="bg-orange-500 h-full" 
                            style={{ width: `${result.semantic_report.confidence * 100}%` }} 
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold text-white/30 uppercase">Detected Subjects</p>
                        <div className="flex flex-wrap gap-1.5">
                          {result.semantic_report.subject.map(s => (
                            <span key={s} className="px-2 py-0.5 bg-white/10 rounded text-[10px] font-medium">{s}</span>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold text-white/30 uppercase">Brand Detection</p>
                        <div className={`px-3 py-1 rounded-lg text-xs font-bold inline-block ${result.semantic_report.brand ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-white/40'}`}>
                          {result.semantic_report.brand || "No brand visible"}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold text-white/30 uppercase">UI Role Fit</p>
                        <div className="flex flex-wrap gap-1.5">
                          {result.semantic_report.ui_role_fit.map(role => (
                            <span key={role} className="px-2 py-0.5 bg-orange-500/20 text-orange-400 rounded text-[10px] font-medium">{role}</span>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold text-white/30 uppercase">Visual Composition</p>
                        <div className="flex flex-wrap gap-1.5">
                          {result.semantic_report.composition.map(c => (
                            <span key={c} className="px-2 py-0.5 bg-white/5 text-white/60 rounded text-[10px] font-medium">{c}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.section>
                )}
              </AnimatePresence>
            </div>
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
    loadTraces();
  }, []);

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
