import './App.css'

/**
 * The approved dashboard UI remains the source of truth while React/Vite
 * provides the build and deployment shell around it. This avoids visual drift
 * while we can later extract features into React one by one.
 */
function App() {
  return <iframe className="dashboard-frame" title="NeuroCrop Control Center" src="./dashboard.html" />
}

export default App
