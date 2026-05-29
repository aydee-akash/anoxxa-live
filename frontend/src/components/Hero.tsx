import { useEffect, useState } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import { Check, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { FrameScrubber } from './FrameScrubber';

/* ── Typewriter hook ─────────────────────────────────────────────────────── */
function useTypewriter(text: string, speed = 38, startDelay = 600) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed('');
    setDone(false);

    // Respect reduced-motion: reveal the full headline at once, no caret typing.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplayed(text);
      setDone(true);
      return;
    }

    let i = 0;
    let interval: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      interval = setInterval(() => {
        i += 1;
        setDisplayed(text.slice(0, i));
        if (i >= text.length) {
          if (interval) clearInterval(interval);
          setDone(true);
        }
      }, speed);
    }, startDelay);

    return () => {
      clearTimeout(start);
      if (interval) clearInterval(interval);
    };
  }, [text, speed, startDelay]);

  return { displayed, done };
}

const SERVICES = ['Personal', 'Home', 'Education', 'Business'];

export default function Hero() {
  const navigate = useNavigate();
  const [services, setServices] = useState<string[]>([]);
  const { displayed, done } = useTypewriter('a loan, settled in\none conversation.');

  const toggleService = (s: string) =>
    setServices((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative bg-white text-neutral-900 font-sans selection:bg-[#EAECE9] selection:text-[#1C2E1E] antialiased overflow-x-hidden flex flex-col lg:block lg:min-h-screen">
        {/* ── Background (image-sequence scrubber) ── */}
        <div className="order-last lg:order-none relative lg:absolute lg:inset-0 lg:z-0 overflow-hidden pointer-events-none w-full aspect-square md:aspect-video lg:aspect-auto lg:h-full bg-neutral-50 lg:bg-transparent">
          <FrameScrubber className="w-full h-full block" />
        </div>

        {/* ── Navbar ── */}
        <header className="fixed top-0 inset-x-0 z-30 px-5 sm:px-8 py-4 sm:py-5 flex flex-row justify-between items-center bg-transparent pointer-events-none [&>*]:pointer-events-auto">
          <div className="flex flex-row gap-3 items-center">
            <span className="text-[21px] sm:text-[26px] tracking-tight text-black font-medium select-none">
              Anoxaa&reg;
            </span>
            <span className="text-[25px] sm:text-[30px] text-black select-none tracking-[-0.02em] font-medium leading-none mb-1">
              &#10033;
            </span>
          </div>

          <button
            type="button"
            onClick={() => navigate('/call')}
            className="text-[19px] sm:text-[23px] text-black underline underline-offset-2 hover:opacity-60 transition-opacity rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4D6D47] focus-visible:ring-offset-2"
          >
            Start now
          </button>
        </header>

        {/* ── Content layer ── */}
        <div className="relative z-10 flex flex-col order-first lg:order-none w-full bg-white lg:bg-transparent pb-8 lg:pb-0 lg:min-h-screen">
          <main
            id="spade-hero"
            className="w-full max-w-7xl mx-auto px-6 py-12 flex-1 flex flex-col justify-center"
          >
            {/* headline */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <h1 className="text-5xl md:text-6xl lg:text-[76px] font-normal tracking-tight text-black leading-[1.08] mb-8 select-none w-full whitespace-pre-wrap">
                {displayed}
                {!done && (
                  <span className="inline-block w-[2px] h-[1.1em] bg-black align-middle ml-[2px] animate-blink" />
                )}
              </h1>
            </motion.div>

            {/* description */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              <p className="text-lg md:text-xl text-[#5A635A] leading-relaxed font-normal mb-14 max-w-2xl">
                No forms. No branch visit. <br /> Talk to Ken on video, show your Aadhaar and PAN, and
                get a real decision in minutes.
              </p>
            </motion.div>

            {/* service pills */}
            <div className="max-w-2xl">
              <h2 id="pills-heading" className="text-2xl font-medium tracking-tight mb-2">
                What&apos;s the loan for?
              </h2>
              <p className="opacity-85 text-[#738273] mb-8">Pick what fits</p>

              <div role="group" aria-labelledby="pills-heading" className="flex flex-wrap gap-3">
                {SERVICES.map((s) => {
                  const active = services.includes(s);
                  return (
                    <motion.button
                      key={s}
                      type="button"
                      onClick={() => toggleService(s)}
                      aria-pressed={active}
                      whileTap={{ scale: 0.96 }}
                      className={`px-5 py-2.5 rounded-full text-base font-medium flex items-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                        active
                          ? 'bg-[#1C2E1E] text-white shadow-md shadow-emerald-950/5 transform focus-visible:ring-white'
                          : 'bg-white text-[#1C2E1E] border border-[#F1F3F1] hover:bg-[#F1F3F1]/55 focus-visible:ring-[#4D6D47]'
                      }`}
                    >
                      <AnimatePresence>
                        {active && (
                          <motion.span
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                            className="flex"
                          >
                            <Check size={16} strokeWidth={2.5} />
                          </motion.span>
                        )}
                      </AnimatePresence>
                      {s}
                    </motion.button>
                  );
                })}
              </div>

              {/* contingent feedback banner */}
              <div aria-live="polite" aria-atomic="true">
                <AnimatePresence mode="wait">
                  {services.length === 0 ? (
                    <motion.p
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.5 }}
                      exit={{ opacity: 0 }}
                      className="italic text-xs mt-6 text-[#5A635A]"
                    >
                      Please click to select services above.
                    </motion.p>
                  ) : (
                    <motion.div
                      key="active"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ type: 'spring', stiffness: 200, damping: 24 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-6 bg-[#FAFBF9] border border-[#F1F3F1] rounded-2xl px-5 py-4 flex items-center justify-between gap-4">
                        <span className="text-[#1C2E1E] text-sm">
                          Starting your application — {services.join(', ')}
                        </span>
                        <button
                          type="button"
                          onClick={() => navigate('/call')}
                          className="shrink-0 text-[#4D6D47] uppercase text-xs font-semibold tracking-wide flex items-center gap-1.5 hover:opacity-70 transition-opacity rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4D6D47] focus-visible:ring-offset-2"
                        >
                          Let&apos;s Go <ArrowRight size={14} strokeWidth={2.5} />
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </main>
        </div>
      </div>
    </MotionConfig>
  );
}
