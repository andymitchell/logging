import { runLogStorageConformance } from "../../conformance/index.ts";
import { sharedMemoryHarnessFactory } from "./testing-helpers/memoryHarnesses.ts";


// The in-process stand-in for a shared substrate: it proves the shared-substrate rules can be met, and is what
// the calibration's shared-substrate decoys are broken copies of.
runLogStorageConformance(sharedMemoryHarnessFactory());
