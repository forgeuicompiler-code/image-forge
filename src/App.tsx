import { useState, useEffect, useRef } from "react";
import { Search, Image as ImageIcon, ShieldCheck, Zap, Info, ExternalLink, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

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
    reason?: string;
  };
}

export default function App() {
  const [subject, setSubject] = useState("Nike running shoes");
  const [brand, setBrand] = useState("Nike");
  const [uiRole, setUiRole] = useState("hero");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ForgeResponse | null>(null);
  
  // Race condition protection
  const requestId = useRef(0);

  const resolveImage = async () => {
    const id = ++requestId.current;
    setLoading(true);
    
    try {
      const response = await fetch("/api/images/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: {
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

  useEffect(() => {
    resolveImage();
  }, []);

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
          <div className="hidden md:flex items-center gap-6 text-sm text-white/60">
            <span className="flex items-center gap-2"><ShieldCheck size={16} /> Brand Safe</span>
            <span className="flex items-center gap-2"><Zap size={16} /> Deterministic</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <p className="text-[10px] font-bold text-white/30 uppercase mb-1">Match Level</p>
              <p className="text-sm font-medium capitalize">{result?.match_level || "---"}</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <p className="text-[10px] font-bold text-white/30 uppercase mb-1">Alt Text</p>
              <p className="text-sm font-medium truncate">{result?.metadata.alt_text || "---"}</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <p className="text-[10px] font-bold text-white/30 uppercase mb-1">System Status</p>
              <p className="text-sm font-medium text-green-500 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse inline-block" />
                Operational
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
