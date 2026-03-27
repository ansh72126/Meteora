"use client";

import "./DeleteAccountDialog.css";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting?: boolean;
}

export default function DeleteAccountDialog({ isOpen, onClose, onConfirm, isDeleting = false }: Props) {
  if (!isOpen) return null;

  return (
    <div className="da-overlay" onClick={onClose}>
      <div className="da-dialog" onClick={(e) => e.stopPropagation()}>

        {/* Icon */}
        <div className="da-icon-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            className="da-icon">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </div>

        {/* Text */}
        <h2 className="da-title">Delete Account</h2>
        <p className="da-msg">
          This action is <span className="da-msg-em">permanent</span> and cannot be undone.
          Are you sure you want to delete your account?
        </p>

        {/* Buttons */}
        <div className="da-actions">
          <button className="da-btn-cancel" onClick={onClose} disabled={isDeleting}>
            Cancel
          </button>
          <button className="da-btn-delete" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? (
              <>
                <span className="da-spinner" />
                Deleting...
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className="da-btn-icon">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
                Delete Account
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}