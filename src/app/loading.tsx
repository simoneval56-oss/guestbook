export default function GlobalLoading() {
  return (
    <div className="page-loading" role="status" aria-live="polite" aria-busy="true">
      <div className="page-loading__card">
        <span className="page-loading__spinner" aria-hidden="true" />
        <span>Caricamento in corso...</span>
      </div>
    </div>
  );
}

