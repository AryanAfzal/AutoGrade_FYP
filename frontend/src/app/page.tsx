'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileText,
  GraduationCap,
  Menu,
  Play,
  ScanText,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Users,
  X,
} from 'lucide-react';
import { getStoredUser, getToken } from '@/lib/api';

const features = [
  {
    image: '/assets/features/feature-handwriting.jpg',
    icon: ScanText,
    title: 'Handwritten Recognition',
    description: 'Extract answers from scanned PDFs and handwritten submissions with confidence scoring.',
  },
  {
    image: '/assets/features/feature-semantic.jpg',
    icon: BrainCircuit,
    title: 'Semantic Evaluation',
    description: 'Compare meaning—not just exact words—with AI-assisted answer matching.',
  },
  {
    image: '/assets/features/feature-bulk-upload.jpg',
    icon: UploadCloud,
    title: 'Simple Bulk Uploads',
    description: 'Upload answer keys and multiple student sheets from one organized workspace.',
  },
  {
    image: '/assets/features/feature-ai-review.jpg',
    icon: ClipboardCheck,
    title: 'AI-Assisted Review',
    description: 'Review generated scores, adjust feedback, and publish results when ready.',
  },
  {
    image: '/assets/features/feature-analytics.jpg',
    icon: BarChart3,
    title: 'Performance Analytics',
    description: 'Understand class performance, difficult questions, and CLO attainment.',
  },
  {
    image: '/assets/features/feature-role-access.jpg',
    icon: ShieldCheck,
    title: 'Role-Based Access',
    description: 'Separate secure workflows for administrators, teachers, and students.',
  },
];

const steps = [
  {
    number: '01',
    image: '/assets/steps/step-01-upload.jpg',
    icon: UploadCloud,
    title: 'Upload your documents',
    description: 'Add the answer key and student answer sheets as PDF files.',
  },
  {
    number: '02',
    image: '/assets/steps/step-02-ai-evaluate.jpg',
    icon: BrainCircuit,
    title: 'Let AI evaluate',
    description: 'Answers are extracted and matched against the expected solution.',
  },
  {
    number: '03',
    image: '/assets/steps/step-03-publish.jpg',
    icon: BarChart3,
    title: 'Review and publish',
    description: 'Inspect scores, add feedback, and share results with students.',
  },
];

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dashboardLink, setDashboardLink] = useState('/login');

  const handleNavScroll = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    setMenuOpen(false);
    const target = document.getElementById(id);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
      window.history.pushState(null, '', `#${id}`);
    }
  };

  useEffect(() => {
    const token = getToken();
    const user = getStoredUser();
    if (!token || !user) return;
    setDashboardLink(
      user.role === 'admin'
        ? '/dashboard/admin'
        : user.role === 'student'
          ? '/dashboard/student'
          : '/dashboard/teacher',
    );
  }, []);

  return (
    <main className="landing-page">
      <header className="landing-nav-wrap">
        <nav className="landing-nav" aria-label="Main navigation">
          <Link href="/" className="brand" aria-label="AutoGrade home">
            <Image
              src="/favicon-round.png"
              alt="AutoGrade Logo"
              width={38}
              height={38}
              className="w-[38px] h-[38px] object-contain rounded-full shadow-sm"
              priority
            />
            <span>AutoGrade</span>
          </Link>

          <div className="nav-links">
            <a href="#features" onClick={(e) => handleNavScroll(e, 'features')}>Features</a>
            <a href="#how-it-works" onClick={(e) => handleNavScroll(e, 'how-it-works')}>How it works</a>
            <a href="#benefits" onClick={(e) => handleNavScroll(e, 'benefits')}>Benefits</a>
            <a href="#security" onClick={(e) => handleNavScroll(e, 'security')}>Security</a>
          </div>

          <div className="nav-actions">
            <Link href="/login" className="nav-login">
              Log in
            </Link>
            <Link href="/register/teacher" className="nav-cta">
              Get started <ArrowRight size={16} />
            </Link>
          </div>

          <button
            type="button"
            className="menu-button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-label="Toggle navigation menu"
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </nav>

        {menuOpen && (
          <div className="mobile-menu">
            <a href="#features" onClick={(e) => handleNavScroll(e, 'features')}>Features</a>
            <a href="#how-it-works" onClick={(e) => handleNavScroll(e, 'how-it-works')}>How it works</a>
            <a href="#benefits" onClick={(e) => handleNavScroll(e, 'benefits')}>Benefits</a>
            <a href="#security" onClick={(e) => handleNavScroll(e, 'security')}>Security</a>
            <Link href="/login" onClick={() => setMenuOpen(false)}>Log in</Link>
            <Link href="/register/teacher" className="mobile-cta" onClick={() => setMenuOpen(false)}>
              Get started
            </Link>
          </div>
        )}
      </header>

      <section className="hero-section">
        <div className="hero-grid">
          <div className="hero-copy">
            <h1 className="reveal-one">
              Grade exams faster.
              <br />
              <span>Teach with confidence.</span>
            </h1>
            <p className="hero-description reveal-three">
              Upload answer keys and student sheets. AutoGrade extracts answers,
              evaluates them semantically, and prepares clear results in minutes.
            </p>
            <div className="hero-actions reveal-four">
              <Link href="/register/teacher" className="primary-button">
                Start evaluating <ArrowRight size={18} />
              </Link>
              <a href="#how-it-works" onClick={(e) => handleNavScroll(e, 'how-it-works')} className="secondary-button">
                <span className="play-icon"><Play size={14} fill="currentColor" /></span>
                See how it works
              </a>
            </div>
            <div className="hero-proof reveal-four">
              <div className="proof-avatars" aria-hidden="true">
                <span>SA</span><span>MK</span><span>HR</span>
              </div>
              <div>
                <div className="proof-stars">★★★★★</div>
                <p>Built for modern academic workflows</p>
              </div>
            </div>
          </div>

          <div className="hero-visual reveal-visual" aria-label="AutoGrade dashboard preview">
            <img
              className="hero-asset"
              src="/assets/grades.png"
              alt="Exam answer sheet and performance illustration"
            />
            <div className="visual-orbit orbit-one" />
            <div className="visual-orbit orbit-two" />
            <div className="dashboard-window">
              <div className="window-bar">
                <div className="window-dots"><span /><span /><span /></div>
                <div className="window-title">Exam overview</div>
                <div className="window-avatar">T</div>
              </div>
              <div className="dashboard-body">
                <aside className="mock-sidebar">
                  <div className="mock-logo !bg-transparent !shadow-none">
                    <Image
                      src="/favicon-round.png"
                      alt="AutoGrade Logo"
                      width={28}
                      height={28}
                      className="w-7 h-7 object-contain rounded-full"
                    />
                  </div>
                  {[BarChart3, FileText, ClipboardCheck, Users].map((Icon, index) => (
                    <span key={index} className={index === 0 ? 'active' : ''}><Icon size={14} /></span>
                  ))}
                </aside>
                <div className="mock-content">
                  <div className="mock-heading">
                    <div>
                      <p>Welcome back, Teacher</p>
                      <strong>Exam Analytics</strong>
                    </div>
                    <span>November 2026</span>
                  </div>
                  <div className="stat-row">
                    <div><span>Exams</span><strong>12</strong><small>+3 this month</small></div>
                    <div><span>Students</span><strong>248</strong><small>92% evaluated</small></div>
                    <div><span>Avg. score</span><strong>78%</strong><small>+6.4% improvement</small></div>
                  </div>
                  <div className="chart-card">
                    <div className="chart-header">
                      <div><span>Student performance</span><strong>Class average</strong></div>
                      <span className="chart-badge">78.4%</span>
                    </div>
                    <div className="chart-area">
                      <div className="chart-lines"><span /><span /><span /><span /></div>
                      <svg viewBox="0 0 520 150" role="img" aria-label="Performance trend chart">
                        <defs>
                          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#2563eb" stopOpacity=".22" />
                            <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <path className="chart-fill" d="M0 122 C65 110, 80 82, 130 92 C185 102, 200 48, 255 70 C310 92, 330 35, 380 54 C430 72, 465 20, 520 38 L520 150 L0 150 Z" />
                        <path className="chart-line" d="M0 122 C65 110, 80 82, 130 92 C185 102, 200 48, 255 70 C310 92, 330 35, 380 54 C430 72, 465 20, 520 38" />
                        <circle cx="255" cy="70" r="5" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="floating-score">
              <div className="score-icon"><CheckCircle2 size={18} /></div>
              <div><span>Evaluation complete</span><strong>92% matched</strong></div>
            </div>
            <div className="floating-file">
              <span><FileText size={18} /></span>
              <div><strong>Answer_Sheet_24.pdf</strong><small>Processing complete</small></div>
              <CheckCircle2 size={16} className="file-check" />
            </div>
          </div>
        </div>
      </section>

      <section className="trust-strip" aria-label="Platform benefits">
        <div>
          <ScanText size={20} />
          <span><strong>Smart extraction</strong><small>Handwritten & printed</small></span>
        </div>
        <div>
          <BrainCircuit size={20} />
          <span><strong>Semantic AI</strong><small>Meaning-based grading</small></span>
        </div>
        <div>
          <ShieldCheck size={20} />
          <span><strong>Secure access</strong><small>Role-based workflows</small></span>
        </div>
        <div>
          <BarChart3 size={20} />
          <span><strong>Instant insights</strong><small>Clear performance data</small></span>
        </div>
      </section>

      <section className="features-section" id="features">
        <div className="section-heading">
          <div>
            <span className="section-kicker">Everything you need</span>
            <h2>One workspace for the complete evaluation cycle</h2>
          </div>
          <p>From document upload to final student results, AutoGrade keeps every step organized and reviewable.</p>
        </div>
        <div className="feature-grid">
          {features.map(({ image, icon: Icon, title, description }) => (
            <article className="feature-card" key={title}>
              <div className="feature-image-wrapper">
                <Image
                  src={image}
                  alt={title}
                  width={380}
                  height={190}
                  className="feature-image"
                />
                <span className="feature-badge">
                  <Icon size={16} />
                </span>
              </div>
              <h3>{title}</h3>
              <p>{description}</p>
              <Link href="/login" className="feature-link">Learn more <ChevronRight size={15} /></Link>
            </article>
          ))}
        </div>
      </section>

      <section className="process-section" id="how-it-works">
        <div className="process-shell">
          <div className="section-heading process-heading">
            <div>
              <span className="section-kicker light">Simple workflow</span>
              <h2>From answer sheet to insight in three steps</h2>
            </div>
            <p>Designed for teachers who need accurate automation without losing human control.</p>
          </div>
          <div className="steps-grid">
            {steps.map(({ number, image, icon: Icon, title, description }) => (
              <article className="step-card" key={number}>
                <div className="step-image-wrapper">
                  <Image
                    src={image}
                    alt={title}
                    width={360}
                    height={180}
                    className="step-image"
                  />
                  <div className="step-top-badge">
                    <span>{number}</span>
                    <Icon size={16} />
                  </div>
                </div>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="benefits-section" id="benefits">
        <div className="benefits-grid">
          <div className="benefits-copy">
            <span className="section-kicker">Better academic decisions</span>
            <h2>Spend less time grading.<br />Focus more on teaching.</h2>
            <p>Replace repetitive checking with a consistent, traceable workflow that gives you more time for feedback and instruction.</p>
            <img
              className="benefits-illustration"
              src="/assets/images.jpg"
              alt="Teacher preparing an exam assessment"
            />
            <Link href="/register/teacher" className="text-button">
              Explore the platform <ArrowRight size={17} />
            </Link>
          </div>
          <div className="comparison-card">
            <div className="comparison-side old">
              <div className="comparison-header"><span>Manual grading</span><X size={18} /></div>
              {['Time-consuming checking', 'Inconsistent evaluations', 'Slow result delivery'].map((item) => (
                <div key={item}><X size={15} /><span>{item}</span></div>
              ))}
            </div>
            <div className="comparison-side new">
              <div className="comparison-header"><span>With AutoGrade</span><CheckCircle2 size={18} /></div>
              {['Automated answer extraction', 'Reviewable AI suggestions', 'Instant class insights'].map((item) => (
                <div key={item}><Check size={15} /><span>{item}</span></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="security-section" id="security">
        <div className="security-card">
          <div className="security-icon"><ShieldCheck size={30} /></div>
          <div>
            <span className="section-kicker">Secure by design</span>
            <h2>Purpose-built access for every role</h2>
            <p>Protect academic documents and keep responsibilities clear across administrators, teachers, and students.</p>
          </div>
          <Link href="/login" className="secondary-button">View platform <ArrowRight size={17} /></Link>
        </div>
      </section>

      <section className="cta-section">
        <div className="cta-card">
          <div className="cta-glow" />
          <div>
            <span>Start your workspace today</span>
            <h2>Ready to transform exam evaluation?</h2>
          </div>
          <div className="cta-actions">
            <Link href="/register/teacher" className="cta-primary">Create an account <ArrowRight size={18} /></Link>
            <Link href="/login" className="cta-login">Already have an account?</Link>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="footer-main">
          <div className="footer-brand">
            <Link href="/" className="brand">
              <Image
                src="/favicon-round.png"
                alt="AutoGrade Logo"
                width={34}
                height={34}
                className="w-[34px] h-[34px] object-contain rounded-full shadow-sm"
              />
              <span>AutoGrade</span>
            </Link>
            <p>AI-assisted examination evaluation for modern academic teams.</p>
          </div>
          <div className="footer-links">
            <div><strong>Product</strong><a href="#features" onClick={(e) => handleNavScroll(e, 'features')}>Features</a><a href="#how-it-works" onClick={(e) => handleNavScroll(e, 'how-it-works')}>How it works</a><Link href={dashboardLink}>Dashboard</Link></div>
            <div><strong>Access</strong><Link href="/login">Log in</Link><Link href="/register/teacher">Teacher sign up</Link><Link href="/register/student">Student sign up</Link></div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 AutoGrade. All rights reserved.</span>
          <span>Built for academic excellence</span>
        </div>
      </footer>
    </main>
  );
}