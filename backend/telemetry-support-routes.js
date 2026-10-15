const validDevEui = value => /^[0-9a-f]{16}$/.test(value);

export function registerTelemetrySupportRoutes(app, { query, requireAuth, getOrganizationId }) {
  // The reception's tenant and current inventory owner must both match.
  app.get('/nodes/:devEui/uplinks', requireAuth, async (req, res, next) => {
    const devEui = String(req.params.devEui).toLowerCase();
    if (!validDevEui(devEui)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid DevEUI' } });
    try {
      const org = getOrganizationId(req);
      const { rows: nodes } = await query('SELECT dev_eui FROM nodes WHERE dev_eui=$1 AND organization_id=$2 AND archived_at IS NULL', [devEui, org]);
      if (!nodes.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Node not found' } });
      const { rows } = await query(`SELECT id,received_at,measured_at,recorded_at,source_event_id,frame_counter,f_port,
        firmware_version,decoder_version,normalizer_version,outcome,evidence,
        raw_payload IS NOT NULL AS raw_payload_available
        FROM uplink_events WHERE dev_eui=$1 AND organization_id=$2
        ORDER BY received_at DESC,id LIMIT 20`, [devEui, org]);
      res.json({ uplinks: rows });
    } catch (error) { next(error); }
  });

  app.get('/nodes/:devEui/uplinks/:eventId', requireAuth, async (req, res, next) => {
    const devEui = String(req.params.devEui).toLowerCase(), id = String(req.params.eventId);
    if (!validDevEui(devEui) || !/^[0-9a-f]{64}$/.test(id)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid uplink identifier' } });
    try {
      const { rows } = await query(`SELECT e.* FROM uplink_events e JOIN nodes n ON n.dev_eui=e.dev_eui
        WHERE e.id=$1 AND e.dev_eui=$2 AND e.organization_id=$3 AND n.organization_id=$3 AND n.archived_at IS NULL`,
      [id, devEui, getOrganizationId(req)]);
      if (!rows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Uplink not found' } });
      res.json({ uplink: rows[0] });
    } catch (error) { next(error); }
  });
}
