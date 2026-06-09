import React, { useState, useEffect } from 'react';
import { Search, Loader2, AlertCircle, BookOpen, User, Calendar, Tag, ArrowLeft, FileText, Monitor, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getPendingExams, cleanDni } from './services/dataService';
import type { PersonalRecord, ExamMetadata } from './types';

function App() {
  const [dni, setDni] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    person: PersonalRecord;
    pending: ExamMetadata[];
  } | null>(null);
  const [modal, setModal] = useState<{ url: string; label: string } | null>(null);
  const [showExamReminder, setShowExamReminder] = useState(false);
  const [videoError, setVideoError] = useState(false);

  const getModalConfig = (url: string): { type: 'iframe' | 'video'; src: string } => {
    // Google Drive /view → /preview (único formato que permite embedding)
    const driveMatch = url.match(/drive\.google\.com\/file\/d\/([^/?]+)/);
    if (driveMatch) {
      return { type: 'iframe', src: `https://drive.google.com/file/d/${driveMatch[1]}/preview` };
    }
    // AppSheet video URL → <video> tag (bypasses X-Frame-Options)
    if (url.includes('appsheet.com') && url.toLowerCase().includes('.mp4')) {
      return { type: 'video', src: url };
    }
    return { type: 'iframe', src: url };
  };

  const closeModal = () => {
    if (modal?.label === 'Rendir Examen') {
      setShowExamReminder(true);
      setTimeout(() => setShowExamReminder(false), 8000);
    }
    setModal(null);
    setVideoError(false);
  };

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (dni.length < 1) return;

    const cleaned = cleanDni(dni);

    setLoading(true);
    setError(null);
    setData(null);

    try {
      const result = await getPendingExams(cleaned);
      if ('error' in result) {
        setError(result.error ?? null);
      } else {
        setData(result);
      }
    } catch (err: any) {
      setError(`Error: ${err.message || 'Desconocido'}`);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Auto-search when DNI is 8 digits
  useEffect(() => {
    if (dni.length === 8) {
      handleSearch();
    }
  }, [dni]);

  return (
    <>
    <div className="container">
      <header className="header">
        <h1>Control de Evaluaciones</h1>
        <p>Consulta tus exámenes programados pendientes aquí</p>
        <p>Regresa a la pagina anterior para rendir evaluaciones</p>
      </header>

      <main>
        <div className="card">
          <form className="search-box" onSubmit={handleSearch}>
            <div className="input-container">
              <Search className="input-icon" size={18} />
              <input
                type="text"
                placeholder="Ingrese su DNI (8 dígitos)"
                value={dni}
                onChange={(e) =>
                  setDni(e.target.value.replace(/\D/g, '').slice(0, 8))
                }
                maxLength={8}
                disabled={loading}
              />
            </div>
            <button
              className="btn"
              type="submit"
              disabled={loading || dni.length < 1}
            >
              {loading ? (
                <Loader2 className="loader" size={20} />
              ) : (
                'Consultar'
              )}
            </button>
          </form>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="error-msg"
              >
                <AlertCircle size={18} />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {data && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="user-info"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <User size={18} color="#1e3a8a" />
                  <h3>{data.person["APELLIDOS Y NOMBRES"]}</h3>
                </div>
                <p style={{ fontSize: '0.75rem', color: '#60a5fa', marginTop: '0.25rem' }}>
                  Estado: {data.person.ESTADO} • DNI Filtro: {data.person.DNI}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <section>
          <AnimatePresence mode="wait">
            {!data && !loading && !error && (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="empty-state"
              >
                <BookOpen size={48} style={{ marginBottom: '1rem', opacity: 0.2 }} />
                <p>Ingresa tu DNI para ver tus pendientes</p>
              </motion.div>
            )}

            {data && data.pending.length > 0 && (
              <motion.div
                key="results"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="exam-grid"
              >
                <div
                  style={{
                    marginBottom: '0.5rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>
                    Pendientes ({data.pending.length})
                  </h2>
                </div>

                {Object.entries(
                  data.pending.reduce(
                    (acc: Record<string, ExamMetadata[]>, exam: ExamMetadata) => {
                      const group =
                        exam.MES && exam.MES.trim() ? exam.MES : 'Sin Mes';
                      if (!acc[group]) acc[group] = [];
                      acc[group].push(exam);
                      return acc;
                    },
                    {}
                  )
                )
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([mes, exams]) => (
                    <div key={mes} style={{ marginBottom: '0.75rem', marginLeft: '1.2rem' }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          margin: '0.5rem 0',
                          fontWeight: 700,
                          color: '#0369a1',
                          fontSize: '1.05em',
                          marginLeft: '0.2rem'
                        }}
                      >
                        <Calendar size={16} />
                        {mes}
                      </div>

                      {exams.map((exam, idx) => (
                        <motion.div
                          key={exam.CODIGO + idx}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className="exam-card"
                          style={{ marginLeft: '1.2rem' }}
                        >
                          <div className="exam-info">
                            <h4>{exam.TEMA}</h4>
                            <div className="meta">
                              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Tag size={12} /> {exam.CODIGO}
                              </span>
                              {exam.AREA && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <BookOpen size={12} /> {exam.AREA}
                                </span>
                              )}
                            </div>
                            {(exam.LINK_EXAMEN || exam.LINK_PRESENTACION || exam.LINK_VIDEO) && (
                              <div className="exam-links">
                                {exam.LINK_EXAMEN && (
                                  <button
                                    className="link-btn examen"
                                    onClick={() => setModal({ url: exam.LINK_EXAMEN!, label: 'Rendir Examen' })}
                                  >
                                    <FileText size={13} /> Examen
                                  </button>
                                )}
                                {exam.LINK_PRESENTACION && (
                                  <button
                                    className="link-btn material"
                                    onClick={() => setModal({ url: exam.LINK_PRESENTACION!, label: 'Material' })}
                                  >
                                    <Monitor size={13} /> Material
                                  </button>
                                )}
                                {exam.LINK_VIDEO && (
                                  <button
                                    className="link-btn video"
                                    onClick={() => setModal({ url: exam.LINK_VIDEO!, label: 'Video' })}
                                  >
                                    <Play size={13} /> Video
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  ))}
              </motion.div>
            )}

            {data && data.pending.length === 0 && (
              <motion.div
                key="all-done"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="empty-state"
              >
                <div style={{ color: 'var(--success)', marginBottom: '1rem' }}>
                  <div style={{ fontSize: '3rem' }}>🎉</div>
                </div>
                <h3>¡Todo completado!</h3>
                <p>No tienes exámenes pendientes programados.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>

      <footer
        style={{
          marginTop: 'auto',
          padding: '2rem 1rem',
          textAlign: 'center',
          color: '#94a3b8',
          fontSize: '0.75rem'
        }}
      >
        Actualización de datos cada 5 minutos • PAC System v1.0
      </footer>
    </div>

    <AnimatePresence>
      {modal && (
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          transition={{ duration: 0.2 }}
        >
          <div className="modal-header">
            <button className="modal-back-btn" onClick={closeModal}>
              <ArrowLeft size={18} /> Volver
            </button>
            <span className="modal-label">{modal.label}</span>
          </div>
          {(() => {
            const cfg = getModalConfig(modal.url);
            if (cfg.type === 'video') {
              return videoError ? (
                <div className="modal-fallback">
                  <p>El video no pudo cargarse en esta vista.</p>
                  <a href={modal.url} target="_blank" rel="noopener noreferrer" className="modal-open-btn">
                    Abrir video en nueva pestaña
                  </a>
                </div>
              ) : (
                <video
                  key={cfg.src}
                  src={cfg.src}
                  controls
                  autoPlay
                  playsInline
                  className="modal-iframe"
                  style={{ background: '#000', objectFit: 'contain' }}
                  onError={() => setVideoError(true)}
                />
              );
            }
            return (
              <iframe
                src={cfg.src}
                className="modal-iframe"
                title={modal.label}
                allow="fullscreen"
              />
            );
          })()}
        </motion.div>
      )}
    </AnimatePresence>

    <AnimatePresence>
      {showExamReminder && (
        <div className="exam-reminder-overlay">
          <motion.div
            className="exam-reminder"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.25, type: 'spring', stiffness: 320, damping: 26 }}
          >
            <div className="exam-reminder-body">
              <p className="exam-reminder-title">⏱ Vuelve a consultar en 5 minutos</p>
              <p className="exam-reminder-subtitle">Ingresa tu DNI nuevamente para verificar que el examen ya no aparece.</p>
              <ul className="exam-reminder-list">
                <li>La <strong>nota mínima aprobatoria es 16</strong></li>
                <li>Asegúrate de haber ingresado tu <strong>DNI correctamente</strong></li>
                <li>La fecha del examen debe coincidir con el <strong>mes programado</strong> de tu capacitación</li>
              </ul>
            </div>
            <button className="exam-reminder-close" onClick={() => setShowExamReminder(false)}>Entendido</button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
    </>
  );
}

export default App;