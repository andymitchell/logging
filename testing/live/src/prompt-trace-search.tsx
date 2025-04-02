
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PromptLoadedTraceInspector } from '../../../src/ui/react/trace/wrappers/PromptLoadedTraceInspector.tsx'


createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <div>
            <h1>Trace Search</h1>
            <PromptLoadedTraceInspector template='neutral' />
        </div>
    </StrictMode>,
  )
  
