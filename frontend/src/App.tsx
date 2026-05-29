import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Hero from './components/Hero'
import CallExperience from './pages/CallExperience'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Hero />} />
        <Route path="/call" element={<CallExperience />} />
      </Routes>
    </BrowserRouter>
  )
}
