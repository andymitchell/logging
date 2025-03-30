
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryLogger } from '../../../src/raw-storage/memory/MemoryLogger';
import { MemoryBreakpoints } from '../../../src/breakpoints/MemoryBreakpoints';
import { initiateBreakpointCommandsInDevTools } from '../../../src/breakpoints/initiateBreakpointCommandsInDevTools';
import { Trace } from '../../../src/index-browser';




const breakpoints = new MemoryBreakpoints();
const logger = new MemoryLogger('', {breakpoints});
initiateBreakpointCommandsInDevTools('theTest', logger.breakpoints);



type LogAdderProps = {

}

const LogAdder: React.FC<LogAdderProps> = (props) => {

    


    return (
        <div>
            
            <button onClick={() => {

                const message = prompt("Message?");

                if( message ) {
                    const trace = new Trace(logger);
                    trace.log(message);
                }
                
            }}>Add</button>

        </div>

    )
}


createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <div>
            <h1>Breakpoints</h1>
            <LogAdder />
        </div>
    </StrictMode>,
  )
  
