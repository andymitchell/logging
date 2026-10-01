import { runLogStorageConformance } from "../../conformance/index.ts";
import { privateMemoryHarnessFactory } from "./testing-helpers/memoryHarnesses.ts";


runLogStorageConformance(privateMemoryHarnessFactory());
