
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TraceInspector } from '../../../src/ui/react/trace/TraceInspector'
import { generateTestLogFetch } from '../../../src/ui/react/trace/testing/testLogFetch';





const testLogFetch = generateTestLogFetch();


createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <div>
            <h1>Trace Search</h1>
            <TraceInspector tracesSource={testLogFetch} template='neutral' />
        </div>
    </StrictMode>,
  )
  
