#include <emscripten/bind.h>
#include "TransferCore.hpp"

using namespace emscripten;

class WasmTransferEngine {
private:
    TransferCore core;

public:
    explicit WasmTransferEngine(size_t chunkSize) : core(chunkSize) {}

    val getSendInputView() {
        return val(typed_memory_view(core.getSendInputCapacity(), core.getSendInputPointer()));
    }

    val compressAndGetOutputView(size_t actualBytes) {
        size_t compressedSize = core.compressChunk(actualBytes);
        return val(typed_memory_view(compressedSize, core.getSendOutputPointer()));
    }

    val getRecvInputView(size_t compressedBytes) {
        return val(typed_memory_view(compressedBytes, core.getRecvInputPointer()));
    }

    val decompressAndGetOutputView(size_t compressedBytes) {
        size_t decompressedSize = core.decompressChunk(compressedBytes);
        return val(typed_memory_view(decompressedSize, core.getRecvOutputPointer()));
    }
};

EMSCRIPTEN_BINDINGS(transfer_module) {
    class_<WasmTransferEngine>("TransferEngine")
        .constructor<size_t>()
        .function("getSendInputView", &WasmTransferEngine::getSendInputView)
        .function("compressAndGetOutputView", &WasmTransferEngine::compressAndGetOutputView)
        .function("getRecvInputView", &WasmTransferEngine::getRecvInputView)
        .function("decompressAndGetOutputView", &WasmTransferEngine::decompressAndGetOutputView);
}
