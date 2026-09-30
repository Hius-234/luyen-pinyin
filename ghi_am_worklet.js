// AudioWorklet: chuyển mẫu PCM thô (float32, một kênh) về luồng chính. Không nén (MediaRecorder nén opus sẽ làm đổi
// năng lượng dải cao -> sai VOT), không xử lý gì thêm.
class ThuMau extends AudioWorkletProcessor {
  process(inputs) {
    const kenh = inputs[0] && inputs[0][0];
    if (kenh) this.port.postMessage(kenh.slice(0));
    return true;
  }
}
registerProcessor('thu-mau', ThuMau);
