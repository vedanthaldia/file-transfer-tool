#include "TransferCore.hpp"
#include <iostream>

TransferCore::TransferCore(size_t chunkSize) {
    sendInputBuffer.resize(chunkSize);
    recvOutputBuffer.resize(chunkSize);

    size_t maxCompressedSize = ZSTD_compressBound(chunkSize);
    sendOutputBuffer.resize(maxCompressedSize);
    recvInputBuffer.resize(maxCompressedSize);
}

uint8_t* TransferCore::getSendInputPointer() { return sendInputBuffer.data(); }
size_t TransferCore::getSendInputCapacity() const { return sendInputBuffer.size(); }
uint8_t* TransferCore::getSendOutputPointer() { return sendOutputBuffer.data(); }

uint8_t* TransferCore::getRecvInputPointer() { return recvInputBuffer.data(); }
uint8_t* TransferCore::getRecvOutputPointer() { return recvOutputBuffer.data(); }

size_t TransferCore::compressChunk(size_t actualBytes) {
    size_t compressedSize = ZSTD_compress(
        sendOutputBuffer.data(), sendOutputBuffer.size(),
        sendInputBuffer.data(), actualBytes, 1
    );
    if (ZSTD_isError(compressedSize)) {
        std::cerr << "Zstd compression error: " << ZSTD_getErrorName(compressedSize) << std::endl;
        return 0;
    }
    return compressedSize;
}

size_t TransferCore::decompressChunk(size_t compressedBytes) {
    size_t decompressedSize = ZSTD_decompress(
        recvOutputBuffer.data(), recvOutputBuffer.size(),
        recvInputBuffer.data(), compressedBytes
    );
    if (ZSTD_isError(decompressedSize)) {
        std::cerr << "Zstd decompression error: " << ZSTD_getErrorName(decompressedSize) << std::endl;
        return 0;
    }
    return decompressedSize;
}
