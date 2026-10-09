import { Component } from 'react'
import { AppProvider, useApp } from './state.jsx'
import { ErrorNote } from './components/ui.jsx'
import { Layout } from './components/Layout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import GenomeExplorer from './pages/GenomeExplorer.jsx'
import AgentComparison from './pages/AgentComparison.jsx'
import Benchmarks from './pages/Benchmarks.jsx'
import History from './pages/History.jsx'
import About from './pages/About.jsx'

const PAGES = {
  dashboard: Dashboard,
  genome: GenomeExplorer,
  compare: AgentComparison,
  benchmarks: Benchmarks,
  history: History,
  about: About,
}

class PageErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) {
    return { error }
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <ErrorNote>
        This page hit an unexpected error: {String(this.state.error?.message || this.state.error)}.{' '}
        <button className="underline" onClick={() => this.setState({ error: null })}>Try again</button>
      </ErrorNote>
    )
  }
}

function Router() {
  const { page } = useApp()
  const Page = PAGES[page] || Dashboard
  return (
    <PageErrorBoundary key={page}>
      <div className="fade-in"><Page /></div>
    </PageErrorBoundary>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Layout>
        <Router />
      </Layout>
    </AppProvider>
  )
}
