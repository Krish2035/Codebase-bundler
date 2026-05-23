import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  Copy, FolderCode, Zap, Files, Hash, Check, 
  Settings2, Maximize2, Minimize2, FileDown 
} from 'lucide-react';
import ForceGraph2D from 'react-force-graph-2d';
import jsPDF from 'jspdf';

interface BundleStats {
  files: number;
  chars: number;
  tokens: number;
}

interface GraphData {
  nodes: any[];
  links: any[];
}

function App() {
  const [projectPath, setProjectPath] = useState('');
  const [bundle, setBundle] = useState('');
  const [stats, setStats] = useState<BundleStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Visualization States
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });

  // --- FULLSCREEN & DIMENSIONS LOGIC ---
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      graphContainerRef.current?.requestFullscreen().catch((err) => {
        console.error(`Error enabling full-screen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const updateDimensions = () => {
      if (document.fullscreenElement) {
        setDimensions({ width: window.innerWidth, height: window.innerHeight });
      } else {
        const parentWidth = graphContainerRef.current?.parentElement?.clientWidth || 800;
        setDimensions({ width: parentWidth * 0.66, height: 500 });
      }
    };

    const handler = () => {
      setIsFullscreen(!!document.fullscreenElement);
      updateDimensions();
    };

    document.addEventListener('fullscreenchange', handler);
    window.addEventListener('resize', updateDimensions);
    updateDimensions();

    return () => {
      document.removeEventListener('fullscreenchange', handler);
      window.removeEventListener('resize', updateDimensions);
    };
  }, []);

  const extensionOptions = ['.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.html', '.md', '.env.example'];
  const [selectedExts, setSelectedExts] = useState<string[]>(['.ts', '.tsx', '.js', '.jsx', '.json']);

  const toggleExtension = (ext: string) => {
    setSelectedExts(prev => prev.includes(ext) ? prev.filter(e => e !== ext) : [...prev, ext]);
  };

  // --- API HANDLERS ---
  const handleBundle = async () => {
    if (!projectPath) return;
    setLoading(true);
    try {
      const { data } = await axios.post('http://localhost:5000/api/bundle', { 
        projectPath,
        allowedExtensions: selectedExts 
      });
      setBundle(data.bundle);
      setStats(data.stats);
      setGraphData(data.graph);
    } catch (error) {
      alert("Bundle Error: Check backend connection or GitHub rate limits.");
    } finally {
      setLoading(false);
    }
  };

  // --- EXPORT LOGIC ---
  const copyToClipboard = () => {
    navigator.clipboard.writeText(bundle);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadPDF = () => {
    const doc = new jsPDF();
    const fileName = projectPath.split(/[/\\]/).pop() || 'codebase';
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const maxLineWidth = pageWidth - (margin * 2);

    // 1. Header Information
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Codebase Bundler Report", margin, 20);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Project: ${projectPath}`, margin, 28);
    doc.text(`Stats: ${stats?.files} Files | ${stats?.tokens.toLocaleString()} Tokens`, margin, 34);
    
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, 38, pageWidth - margin, 38);
    
    // 2. Multi-page Text Logic
    doc.setFont("courier", "normal"); // Using Courier for monospaced code look
    doc.setFontSize(8);

    // Split the bundle text to fit the page width
    const splitText = doc.splitTextToSize(bundle, maxLineWidth);
    
    let cursorY = 45;
    const lineHeight = 4;

    splitText.forEach((line: string) => {
      // Check if we need a new page
      if (cursorY + lineHeight > pageHeight - margin) {
        doc.addPage();
        cursorY = margin;
      }
      doc.text(line, margin, cursorY);
      cursorY += lineHeight;
    });
    
    doc.save(`${fileName}-bundle.pdf`);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6 font-sans selection:bg-blue-500/30">
      <div className="max-w-6xl mx-auto space-y-8">
        
        <header className="flex items-center justify-between py-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-600/10 rounded-2xl border border-blue-500/20">
              <FolderCode className="text-blue-500" size={32} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Codebase Bundler</h1>
              <p className="text-slate-500 text-sm italic">Local path or GitHub URL to AI prompt</p>
            </div>
          </div>
        </header>

        <section className="bg-slate-900/50 p-6 rounded-3xl border border-slate-800 shadow-2xl space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-3 text-slate-400">
              <Settings2 size={16} />
              <span className="text-sm font-medium">Included Extensions</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {extensionOptions.map(ext => (
                <button
                  key={ext}
                  onClick={() => toggleExtension(ext)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                    selectedExts.includes(ext)
                    ? 'bg-blue-600/20 border-blue-500/50 text-blue-400'
                    : 'bg-slate-950 border-slate-800 text-slate-600'
                  }`}
                >
                  {ext}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-4">
            <input
              type="text"
              value={projectPath}
              onChange={(e) => setProjectPath(e.target.value)}
              placeholder="F:/Project  OR  https://github.com/user/repo"
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all text-sm text-white"
            />
            <button
              onClick={handleBundle}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 px-8 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all text-white cursor-pointer shadow-lg shadow-blue-900/20"
            >
              {loading ? (
                <div className="animate-spin h-5 w-5 border-2 border-white/20 border-t-white rounded-full" />
              ) : (
                <><Zap size={18} /> Generate Bundle</>
              )}
            </button>
          </div>
        </section>

        {graphData.nodes.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            <div 
              ref={graphContainerRef}
              className={`lg:col-span-2 bg-slate-950 rounded-3xl border border-slate-800 overflow-hidden relative shadow-inner ${isFullscreen ? 'fixed inset-0 z-50 w-screen h-screen' : 'min-h-[500px]'}`}
            >
              <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-full border border-slate-700 backdrop-blur-md">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Codebase Map</span>
              </div>

              <button 
                onClick={toggleFullScreen}
                className="absolute top-4 right-4 z-20 p-2 bg-slate-900/80 hover:bg-slate-800 rounded-xl border border-slate-700 text-slate-300 transition-all cursor-pointer"
              >
                {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
              </button>
              
              <ForceGraph2D
                graphData={graphData}
                backgroundColor="transparent"
                linkColor={() => '#1e293b'}
                nodeRelSize={6}
                width={dimensions.width}
                height={dimensions.height}
                nodeCanvasObject={(node: any, ctx, globalScale) => {
                  const label = node.label || node.id;
                  const fontSize = 12 / globalScale;
                  ctx.font = `${fontSize}px Inter, sans-serif`;
                  ctx.beginPath();
                  ctx.arc(node.x, node.y, 5, 0, 2 * Math.PI, false);
                  ctx.fillStyle = node.type === 'folder' ? '#3b82f6' : '#94a3b8';
                  ctx.fill();
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.fillStyle = 'white';
                  ctx.fillText(label, node.x, node.y + 12);
                }}
              />
            </div>

            <div className={`space-y-4 ${isFullscreen ? 'hidden' : ''}`}>
              <div className="bg-slate-900/50 p-5 rounded-2xl border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3 text-indigo-400">
                  <Files size={20} />
                  <span className="text-sm font-medium text-slate-300">Files</span>
                </div>
                <span className="text-xl font-mono font-bold text-white">{stats?.files || 0}</span>
              </div>

              <div className="bg-slate-900/50 p-5 rounded-2xl border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3 text-emerald-400">
                  <Hash size={20} />
                  <span className="text-sm font-medium text-slate-300">Tokens</span>
                </div>
                <span className="text-xl font-mono font-bold text-white">
                  {stats?.tokens.toLocaleString() || 0}
                </span>
              </div>

              <div className="flex flex-col gap-3 pt-4">
                <button 
                  onClick={copyToClipboard}
                  className={`w-full py-4 rounded-2xl flex items-center justify-center gap-3 font-bold transition-all border ${
                    copied 
                    ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' 
                    : 'bg-blue-600 border-blue-500 text-white hover:bg-blue-500 shadow-lg cursor-pointer'
                  }`}
                >
                  {copied ? <><Check size={20} /> Copied</> : <><Copy size={20} /> Copy Bundle</>}
                </button>

                <button 
                  onClick={downloadPDF}
                  className="w-full py-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-2xl flex items-center justify-center gap-3 font-bold text-slate-200 transition-all cursor-pointer"
                >
                  <FileDown size={20} /> Save as PDF
                </button>
              </div>
            </div>
          </div>
        )}

        {bundle && (
          <div className={`bg-slate-900/50 rounded-2xl border border-slate-800 overflow-hidden flex flex-col ${isFullscreen ? 'hidden' : ''}`}>
            <div className="px-5 py-3 bg-slate-800/50 border-b border-slate-800 flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Bundle Preview (First 1k chars)</span>
            </div>
            <pre className="p-5 text-xs font-mono text-slate-400 overflow-auto max-h-[250px] leading-relaxed">
              {bundle.substring(0, 1000)}...
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;