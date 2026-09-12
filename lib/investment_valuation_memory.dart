part of 'main.dart';

extension _ValuationMemory on _InvestmentWorkspaceState {
  bool get worksheetMemoryEnabled =>
      company?.containsKey('worksheetHead') == true && review == null;

  Map<String, dynamic> worksheetInputs() => {
    'name': scenarioName.text,
    'hypothesis': hypothesis.text,
    'assumptions': edited(),
    'parentId': scenarioParentId,
  };
  String worksheetFingerprint() => jsonEncode(worksheetInputs());

  void scheduleWorksheetSave() {
    if (!worksheetMemoryEnabled) return;
    worksheetTimer?.cancel();
    updateUI(() => worksheetStatus = 'pending');
    // Keep typing and calculation independent of database/network latency.
    worksheetTimer = Timer(const Duration(milliseconds: 650), () {
      unawaited(persistWorksheet());
    });
  }

  Future<bool> persistWorksheet() async {
    if (!worksheetMemoryEnabled) return true;
    worksheetTimer?.cancel();
    while (worksheetFlight != null) {
      final ok = await worksheetFlight!;
      if (!ok || !mounted) return false;
    }
    if (worksheetSavedFingerprint == worksheetFingerprint() &&
        worksheetRetry == null) {
      updateUI(
        () => worksheetStatus = company?['activeWorksheet'] == null
            ? 'initial'
            : 'saved',
      );
      return true;
    }
    final work = sendWorksheet();
    worksheetFlight = work;
    final ok = await work;
    worksheetFlight = null;
    if (ok && mounted && worksheetSavedFingerprint != worksheetFingerprint()) {
      return persistWorksheet();
    }
    return ok;
  }

  Future<bool> sendWorksheet() async {
    final contextSerial = requestSerial;
    // A timeout may have committed. Retry the identical idempotency key/body;
    // only then send newer edits. Concurrent tabs get a conflict, not data loss.
    final body =
        worksheetRetry ??
        {
          ...worksheetInputs(),
          'operationId': op(),
          'ticker': ticker,
          'asOf': asOf,
          'snapshotId': asMap(company?['snapshot'])['id'],
          'expectedHead': worksheetHead,
        };
    final fingerprint = jsonEncode({
      for (final key in ['name', 'hypothesis', 'assumptions', 'parentId'])
        key: body[key],
    });
    worksheetRetry = body;
    updateUI(() {
      worksheetStatus = 'saving';
      worksheetFailure = null;
    });
    try {
      final saved = await widget.api
          .postJson('/api/investment/valuation-drafts', body)
          .timeout(const Duration(seconds: 12));
      if (!mounted || requestSerial != contextSerial) return false;
      if (saved['id'] == null || saved['kind'] != 'valuation_draft') {
        throw StateError('invalid_save_response');
      }
      updateUI(() {
        worksheetHead = text(saved['id']);
        worksheetSavedFingerprint = fingerprint;
        worksheetRetry = null;
        worksheetStatus = 'saved';
        company?['worksheetHead'] = worksheetHead;
        company?['activeWorksheet'] = saved;
      });
      return true;
    } catch (e) {
      if (mounted && requestSerial == contextSerial) {
        updateUI(() {
          worksheetStatus = 'error';
          worksheetFailure = e.toString();
        });
      }
      return false;
    }
  }

  Widget worksheetSaveIndicator() {
    final conflict =
        worksheetFailure?.contains('worksheet_changed_in_another_session') ==
        true;
    final failed = worksheetStatus == 'error';
    final saving = worksheetStatus == 'saving' || worksheetStatus == 'pending';
    return Column(
      key: const ValueKey('worksheet-save-status'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          failed
              ? w('Not saved · your edits are still here', '尚未保存 · 修改仍保留在此处')
              : saving
              ? w('Saving your changes…', '正在保存你的修改…')
              : worksheetStatus == 'saved'
              ? w('Auto-saved to your account', '已自动保存到你的账户')
              : w('Prefilled · edits save automatically', '已预填 · 修改后自动保存'),
          style: TextStyle(
            color: failed ? p.secondary : p.accent,
            fontSize: 12,
          ),
        ),
        if (failed) ...[
          const SizedBox(height: 5),
          label(
            conflict
                ? 'A newer version exists in another tab. Copy your edits before reloading; nothing was overwritten.'
                : 'Connection or source data changed. Retry saving before leaving this page.',
            conflict
                ? '其他窗口已有较新版本。请先复制你的修改再重新载入；系统没有覆盖任何内容。'
                : '连接或源数据有变化，离开此页前请重试保存。',
            size: 11,
          ),
          if (!conflict)
            TextButton(
              onPressed: () => unawaited(persistWorksheet()),
              child: Text(w('Retry saving', '重试保存')),
            ),
        ],
      ],
    );
  }
}
