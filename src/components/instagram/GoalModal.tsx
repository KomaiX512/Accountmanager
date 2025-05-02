import React, { useState } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';

interface GoalModalProps {
  username: string;
  onClose: () => void;
}

interface GoalForm {
  persona: string;
  timeline: string;
  goal: string;
  instruction: string;
}

const GoalModal: React.FC<GoalModalProps> = ({ username, onClose }) => {
  const [form, setForm] = useState<GoalForm>({ persona: '', timeline: '', goal: '', instruction: '' });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'timeline' && value && !/^\d*$/.test(value)) return; // Only allow numbers
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const canSubmit =
    !!form.timeline &&
    !!form.goal.trim() &&
    !!form.instruction.trim() &&
    /^\d+$/.test(form.timeline);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await axios.post(`http://localhost:3000/save-goal/${username}`, {
        persona: form.persona,
        timeline: Number(form.timeline),
        goal: form.goal,
        instruction: form.instruction,
      });
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save goal.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      className="popup-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
    >
      <motion.div
        className="popup-content"
        initial={{ scale: 0.8, y: 50 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.8, y: 50 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 500, width: '100%' }}
      >
        <h2 style={{ color: '#00ffcc', textAlign: 'center', marginBottom: 10 }}>Set Your Goal</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Persona <span style={{ color: '#a0a0cc', fontWeight: 400 }}>(optional)</span></label>
            <input
              type="text"
              name="persona"
              value={form.persona}
              onChange={handleChange}
              className="form-input"
              placeholder="Whom should I mimic? (e.g. as Account holder)"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Timeline <span style={{ color: '#ff4444' }}>*</span></label>
            <input
              type="text"
              name="timeline"
              value={form.timeline}
              onChange={handleChange}
              className="form-input"
              placeholder="Days to accomplish (number only)"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Goal <span style={{ color: '#ff4444' }}>*</span></label>
            <textarea
              name="goal"
              value={form.goal}
              onChange={handleChange}
              className="form-input"
              rows={3}
              placeholder="What do you want to achieve? (e.g. engagement, reach, followers, etc.)"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Instruction <span style={{ color: '#ff4444' }}>*</span></label>
            <textarea
              name="instruction"
              value={form.instruction}
              onChange={handleChange}
              className="form-input"
              rows={3}
              placeholder="What should be the theme? What should be avoided?"
              required
            />
          </div>
          {error && <div className="form-error">{error}</div>}
          {success && <div style={{ color: '#00ffcc', textAlign: 'center', margin: '10px 0' }}>Goal saved!</div>}
          <div className="form-actions">
            <button
              type="button"
              onClick={onClose}
              className="insta-btn disconnect"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`insta-btn connect${!canSubmit || isSubmitting ? ' disabled' : ''}`}
              disabled={!canSubmit || isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Save Goal'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};

export default GoalModal; 