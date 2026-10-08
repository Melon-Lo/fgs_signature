// --- 變數與元件初始化 ---
const docCanvas = document.getElementById('docCanvas');
const docCtx = docCanvas.getContext('2d');
const canvasWrapper = document.getElementById('canvasWrapper');
const boxPrincipal = document.getElementById('boxPrincipal');
const boxDelegate = document.getElementById('boxDelegate');

const signPrincipalBtn = document.getElementById('signPrincipalBtn');
const signDelegateBtn = document.getElementById('signDelegateBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const downloadBtn = document.getElementById('downloadBtn');

const signatureModalEl = document.getElementById('signatureModal');
const signatureModal = new bootstrap.Modal(signatureModalEl);
const signatureCanvas = document.getElementById('signatureCanvas');
const clearPadBtn = document.getElementById('clearPadBtn');
const saveSignatureBtn = document.getElementById('saveSignatureBtn');

// 簽名框在底圖 (1055 x 1491) 的絕對尺寸與中心坐標配置 (比例 374:84)
const BOX_CONFIG = {
	principal: {
		x: 384,
		y: 952,
		w: 374,
		h: 84,
		centerX: 571,
		centerY: 994,
		title: '委託人簽名',
	},
	delegate: {
		x: 384,
		y: 1062,
		w: 374,
		h: 84,
		centerX: 571,
		centerY: 1104,
		title: '受委託人簽名',
	},
};

let signaturePad = null;
let baseImage = new Image();
let isImageLoaded = false;

// 簽名資料儲存 (僅允許 principal 與 delegate 兩個位置)
const signatures = {
	principal: null,
	delegate: null,
};

let currentSigningRole = 'principal';

// --- 載入底圖 ---
baseImage.onload = () => {
	isImageLoaded = true;
	docCanvas.width = baseImage.naturalWidth || 1055;
	docCanvas.height = baseImage.naturalHeight || 1491;
	renderDocument();
};

// 優先使用本地 Base64，若無則讀取 raw_form.jpg
baseImage.src =
	window.RAW_FORM_BASE64 && window.RAW_FORM_BASE64.length > 50
		? window.RAW_FORM_BASE64
		: 'raw_form.jpg';

// --- 渲染文件 (底圖 + 簽名) ---
function renderDocument() {
	if (!isImageLoaded) return;

	// 清空畫布並重繪底圖
	docCtx.clearRect(0, 0, docCanvas.width, docCanvas.height);
	docCtx.drawImage(baseImage, 0, 0, docCanvas.width, docCanvas.height);

	// 繪製委託人簽名
	if (signatures.principal) {
		const sig = signatures.principal;
		docCtx.drawImage(
			sig.canvas,
			sig.x - sig.width / 2,
			sig.y - sig.height / 2,
			sig.width,
			sig.height,
		);
	}

	// 繪製受委託人簽名
	if (signatures.delegate) {
		const sig = signatures.delegate;
		docCtx.drawImage(
			sig.canvas,
			sig.x - sig.width / 2,
			sig.y - sig.height / 2,
			sig.width,
			sig.height,
		);
	}

	// 更新按鈕狀態
	updateUIState();
}

// --- 更新工具列與簽名框狀態 ---
function updateUIState() {
	const hasAnySig = !!(signatures.principal || signatures.delegate);
	clearAllBtn.disabled = !hasAnySig;

	// 委託人按鈕與簽名框狀態
	if (signatures.principal) {
		signPrincipalBtn.classList.remove('btn-outline-primary');
		signPrincipalBtn.classList.add('btn-primary');
		signPrincipalBtn.innerHTML =
			'<i class="bi bi-check-circle me-1"></i>委託人已簽';
		boxPrincipal.classList.add('signed');
	} else {
		signPrincipalBtn.classList.remove('btn-primary');
		signPrincipalBtn.classList.add('btn-outline-primary');
		signPrincipalBtn.innerHTML = '<i class="bi bi-pencil me-1"></i>委託人簽名';
		boxPrincipal.classList.remove('signed');
	}

	// 受委託人按鈕與簽名框狀態
	if (signatures.delegate) {
		signDelegateBtn.classList.remove('btn-outline-primary');
		signDelegateBtn.classList.add('btn-primary');
		signDelegateBtn.innerHTML =
			'<i class="bi bi-check-circle me-1"></i>受委託人已簽';
		boxDelegate.classList.add('signed');
	} else {
		signDelegateBtn.classList.remove('btn-primary');
		signDelegateBtn.classList.add('btn-outline-primary');
		signDelegateBtn.innerHTML = '<i class="bi bi-pencil me-1"></i>受委託人簽名';
		boxDelegate.classList.remove('signed');
	}
}

// --- 開啟指定角色的簽名 Modal ---
function openSignatureModal(role) {
	currentSigningRole = role;
	const config = BOX_CONFIG[role];
	document.getElementById('signatureModalLabel').innerHTML =
		`<i class="bi bi-pen-fill text-primary me-2"></i>${config.title}`;
	signatureModal.show();
}

// --- Signature Pad 初始化 ---
signaturePad = new SignaturePad(signatureCanvas, {
	minWidth: 1.5,
	maxWidth: 3.5,
	penColor: '#0a0a0a',
});

signatureModalEl.addEventListener('shown.bs.modal', () => {
	resizeSignaturePadCanvas();
	loadExistingSignatureIfAny();
});

function resizeSignaturePadCanvas() {
	const ratio = Math.max(window.devicePixelRatio || 1, 1);
	const rect = signatureCanvas.getBoundingClientRect();
	signatureCanvas.width = rect.width * ratio;
	signatureCanvas.height = rect.height * ratio;
	const ctx = signatureCanvas.getContext('2d');
	ctx.scale(ratio, ratio);
	signaturePad.clear();
}

// 根據視窗縮放等比例縮放筆跡點陣列
function getScaledPointGroups(
	pointGroups,
	prevWidth,
	prevHeight,
	newWidth,
	newHeight,
) {
	if (!prevWidth || !prevHeight || !newWidth || !newHeight) {
		return pointGroups;
	}
	const scaleX = newWidth / prevWidth;
	const scaleY = newHeight / prevHeight;
	if (Math.abs(scaleX - 1) < 0.005 && Math.abs(scaleY - 1) < 0.005) {
		return pointGroups;
	}
	return pointGroups.map((group) => ({
		...group,
		points: (group.points || []).map((pt) => ({
			...pt,
			x: pt.x * scaleX,
			y: pt.y * scaleY,
		})),
	}));
}

// 若當前角色原本已有簽名，自動載入並保留筆跡
function loadExistingSignatureIfAny() {
	const existing = signatures[currentSigningRole];
	if (existing && existing.padData && existing.padData.length > 0) {
		const rect = signatureCanvas.getBoundingClientRect();
		const currentW = rect.width;
		const currentH = rect.height;
		const scaledData = getScaledPointGroups(
			existing.padData,
			existing.padWidth,
			existing.padHeight,
			currentW,
			currentH,
		);
		signaturePad.fromData(scaledData);
	} else if (existing && existing.dataUrl) {
		signaturePad.fromDataURL(existing.dataUrl);
	} else {
		signaturePad.clear();
	}
}

clearPadBtn.addEventListener('click', () => {
	signaturePad.clear();
});

// --- 裁切多餘邊框，取得緊湊簽名圖片 ---
function getTrimmedSignature(srcCanvas) {
	const ctx = srcCanvas.getContext('2d');
	const w = srcCanvas.width;
	const h = srcCanvas.height;
	const imgData = ctx.getImageData(0, 0, w, h);
	const data = imgData.data;

	let minX = w,
		minY = h,
		maxX = 0,
		maxY = 0;
	let hasPixels = false;

	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const alpha = data[(y * w + x) * 4 + 3];
			if (alpha > 15) {
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
				hasPixels = true;
			}
		}
	}

	if (!hasPixels) return null;

	const pad = 6;
	minX = Math.max(0, minX - pad);
	minY = Math.max(0, minY - pad);
	maxX = Math.min(w - 1, maxX + pad);
	maxY = Math.min(h - 1, maxY + pad);

	const cropW = maxX - minX + 1;
	const cropH = maxY - minY + 1;

	const trimmed = document.createElement('canvas');
	trimmed.width = cropW;
	trimmed.height = cropH;
	const tCtx = trimmed.getContext('2d');
	tCtx.drawImage(srcCanvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);

	return trimmed;
}

// --- 完成並儲存簽名 ---
saveSignatureBtn.addEventListener('click', () => {
	if (signaturePad.isEmpty()) {
		alert('請先在方格內完成簽名！');
		return;
	}

	const trimmed = getTrimmedSignature(signatureCanvas);
	if (!trimmed) {
		alert('未偵測到簽名筆跡，請重新書寫。');
		return;
	}

	const config = BOX_CONFIG[currentSigningRole];

	// 充分填滿簽名框 (框尺寸 374 x 84)
	const maxW = 358;
	const maxH = 76;
	const scale = Math.min(maxW / trimmed.width, maxH / trimmed.height);
	const drawW = Math.round(trimmed.width * scale);
	const drawH = Math.round(trimmed.height * scale);

	const rect = signatureCanvas.getBoundingClientRect();

	signatures[currentSigningRole] = {
		canvas: trimmed,
		x: config.centerX,
		y: config.centerY,
		width: drawW,
		height: drawH,
		padData: signaturePad.toData(),
		padWidth: rect.width,
		padHeight: rect.height,
		dataUrl: signatureCanvas.toDataURL(),
	};

	renderDocument();
	signatureModal.hide();
});

// --- 點擊簽名框直接簽名 ---
boxPrincipal.addEventListener('click', (e) => {
	e.stopPropagation();
	openSignatureModal('principal');
});

boxDelegate.addEventListener('click', (e) => {
	e.stopPropagation();
	openSignatureModal('delegate');
});

// --- 點擊畫布本體：若點在簽名框區域則簽名，其餘區域完全不觸發 ---
docCanvas.addEventListener('click', (e) => {
	const rect = docCanvas.getBoundingClientRect();
	const scaleX = docCanvas.width / rect.width;
	const scaleY = docCanvas.height / rect.height;

	const clickX = (e.clientX - rect.left) * scaleX;
	const clickY = (e.clientY - rect.top) * scaleY;

	const tol = 15; // 觸控寬容度
	const p = BOX_CONFIG.principal;
	if (
		clickX >= p.x - tol &&
		clickX <= p.x + p.w + tol &&
		clickY >= p.y - tol &&
		clickY <= p.y + p.h + tol
	) {
		openSignatureModal('principal');
		return;
	}

	const d = BOX_CONFIG.delegate;
	if (
		clickX >= d.x - tol &&
		clickX <= d.x + d.w + tol &&
		clickY >= d.y - tol &&
		clickY <= d.y + d.h + tol
	) {
		openSignatureModal('delegate');
		return;
	}

	// 其餘區域不執行任何動作
});

// --- 快捷按鈕事件 ---
signPrincipalBtn.addEventListener('click', () => {
	openSignatureModal('principal');
});

signDelegateBtn.addEventListener('click', () => {
	openSignatureModal('delegate');
});

// 清除全部
clearAllBtn.addEventListener('click', () => {
	if (confirm('確定要清除所有簽名嗎？')) {
		signatures.principal = null;
		signatures.delegate = null;
		renderDocument();
	}
});

// --- 下載圖檔 ---
downloadBtn.addEventListener('click', () => {
	if (!isImageLoaded) return;

	try {
		const link = document.createElement('a');
		link.download = '委託書_已簽名.jpg';
		link.href = docCanvas.toDataURL('image/jpeg', 0.95);
		link.click();
	} catch (err) {
		console.error('Download error:', err);
		alert('下載時發生錯誤：' + err.message);
	}
});
