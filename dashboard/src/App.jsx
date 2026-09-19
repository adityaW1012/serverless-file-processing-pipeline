import { useState, useEffect } from "react";
import "./App.css";

const API_URL = "https://zg3zzteuw5.execute-api.ap-south-1.amazonaws.com/Prod/files";

function StatusBadge({ status }) {
  const isSuccess = status === "PROCESSED";
  return (
    <span className={`badge ${isSuccess ? "badge-success" : "badge-failed"}`}>
      {status}
    </span>
  );
}

function FileTypeIcon({ fileType }) {
  return <span className="file-icon">{fileType === "image" ? "🖼️" : "📄"}</span>;
}

function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString();
}

function formatBytes(bytes) {
  if (!bytes) return "—";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function App() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchFiles = async () => {
    try {
      setLoading(true);
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const data = await res.json();
      setFiles(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Failed to load files. Check the API URL and CORS settings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const total = files.length;
  const successCount = files.filter((f) => f.status === "PROCESSED").length;
  const failedCount = total - successCount;

  return (
    <div className="dashboard">
      <header className="header">
        <h1>File Processing Dashboard</h1>
        <button onClick={fetchFiles} className="refresh-btn">
          ⟳ Refresh
        </button>
      </header>

      <div className="stats">
        <div className="stat-card">
          <span className="stat-number">{total}</span>
          <span className="stat-label">Total Files</span>
        </div>
        <div className="stat-card stat-success">
          <span className="stat-number">{successCount}</span>
          <span className="stat-label">Processed</span>
        </div>
        <div className="stat-card stat-failed">
          <span className="stat-number">{failedCount}</span>
          <span className="stat-label">Failed</span>
        </div>
      </div>

      {loading && <p className="loading">Loading files...</p>}
      {error && <p className="error">{error}</p>}

      {!loading && !error && (
        <table className="file-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Original File</th>
              <th>Status</th>
              <th>Size</th>
              <th>Uploaded</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr key={file.fileId}>
                <td>
                  <FileTypeIcon fileType={file.fileType} />
                </td>
                <td>{file.originalKey}</td>
                <td>
                  <StatusBadge status={file.status} />
                </td>
                <td>{formatBytes(file.sizeBytes)}</td>
                <td>{formatDate(file.createdAt)}</td>
                <td>
                  {file.status === "PROCESSED" ? (
                    <span className="result-key">{file.processedKey}</span>
                  ) : (
                    <span className="error-msg">{file.error || "—"}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!loading && !error && files.length === 0 && (
        <p className="empty">No files processed yet. Upload something to get started!</p>
      )}
    </div>
  );
}

export default App;