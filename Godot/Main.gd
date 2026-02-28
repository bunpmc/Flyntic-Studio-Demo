extends Control
## Flyntic Studio — Godot Drone Assembly & Simulation
## Ported from web demo (Three.js) with full physics preview

# ──────────────────────────── NODE REFS ────────────────────────────
# These paths EXACTLY match Main.tscn node tree

# Left sidebar
@onready var comp_list: ItemList = $Root/Content/Left/CompPanel/V/CompList
@onready var hier_tree: Tree   = $Root/Content/Left/HierarchyPanel/V/Tree
@onready var hier_del_btn: Button = $Root/Content/Left/HierarchyPanel/V/H/DelBtn

# 3D scene nodes
@onready var scene_root: Node3D     = $Root/Content/CenterRight/Center/Tabs/Canvas/VPC/VP/Scene
@onready var pivot: Node3D           = $Root/Content/CenterRight/Center/Tabs/Canvas/VPC/VP/Scene/Pivot
@onready var camera: Camera3D        = $Root/Content/CenterRight/Center/Tabs/Canvas/VPC/VP/Scene/Pivot/Camera
@onready var components_group: Node3D = $Root/Content/CenterRight/Center/Tabs/Canvas/VPC/VP/Scene/Components
@onready var snap_hints: Node3D      = $Root/Content/CenterRight/Center/Tabs/Canvas/VPC/VP/Scene/SnapHints
@onready var wires_group: Node3D     = $Root/Content/CenterRight/Center/Tabs/Canvas/VPC/VP/Scene/Wires
@onready var viewport: SubViewport   = $Root/Content/CenterRight/Center/Tabs/Canvas/VPC/VP

# Console & monitors
@onready var log_box: RichTextLabel = $Root/Content/CenterRight/Center/Console/V/Log
@onready var weight_val: Label = $Root/Content/CenterRight/Right/Scroll/V/Perf/Weight/Val
@onready var thrust_val: Label = $Root/Content/CenterRight/Right/Scroll/V/Perf/Thrust/Val
@onready var twr_val: Label    = $Root/Content/CenterRight/Right/Scroll/V/Perf/TWR/Val
@onready var cap_val: Label    = $Root/Content/CenterRight/Right/Scroll/V/Perf/Capability/Val
@onready var bat_val: Label    = $Root/Content/CenterRight/Right/Scroll/V/Power/Battery/Val
@onready var ft_val: Label     = $Root/Content/CenterRight/Right/Scroll/V/Power/FlightTime/Val
@onready var diag_text: RichTextLabel = $Root/Content/CenterRight/Right/Scroll/V/Diag/DiagText
@onready var comp_count: Label = $Root/StatusBar/H/Comp

# Simulation buttons
@onready var play_btn: Button  = $Root/Content/CenterRight/Right/Scroll/V/SimPanel/PlayBtn
@onready var pause_btn: Button = $Root/Content/CenterRight/Right/Scroll/V/SimPanel/PauseBtn
@onready var stop_btn: Button  = $Root/Content/CenterRight/Right/Scroll/V/SimPanel/StopBtn
@onready var sim_label: Label  = $Root/Content/CenterRight/Right/Scroll/V/SimPanel/StatusLbl
@onready var topbar_status: Label = $Root/TopBar/H/Status

# ──────────────────────────── DATA ────────────────────────────────
# Scale factor: OBJ is in mm, we want ~5.4 Godot units span
const FRAME_SCALE := 0.01

var CATEGORIES := {
	"FRAME": ["PVC Pipe Frame", "Carbon Fiber Body"],
	"MOTOR": ["Motor 2205 2300KV", "Motor 2207 2400KV", "Motor 2212 920KV"],
	"PROPELLER": ["Propeller 5045", "Propeller 6045"],
	"BATTERY": ["Lipo 4S 1500mAh"],
	"ELECTRONICS": ["F4 Flight Controller", "4-in-1 ESC"],
}

var COMPONENTS := {
	"PVC Pipe Frame": {
		"type": "Frame", "weight": 250, "thrust": 0, "capacity": 0,
		"color": Color(0.75, 0.75, 0.7),
		"use_obj": true, "obj_path": "res://Components/quad_pvc_frame.obj",
		"ports": [
			# Motor mounts at the 4 arm tips (from OBJ data: ±228mm scaled by 0.01)
			{"name": "fl", "pos": Vector3(2.28, 2.01, 2.28), "slot": true, "allowed": ["Motor"]},
			{"name": "fr", "pos": Vector3(2.28, 2.01, -2.28), "slot": true, "allowed": ["Motor"]},
			{"name": "bl", "pos": Vector3(-2.28, 2.01, 2.28), "slot": true, "allowed": ["Motor"]},
			{"name": "br", "pos": Vector3(-2.28, 2.01, -2.28), "slot": true, "allowed": ["Motor"]},
			# Center platform for electronics (Y=1.18 is midpoint height)
			{"name": "center_top", "pos": Vector3(0, 1.8, 0), "slot": true, "allowed": ["FC", "ESC"]},
			{"name": "center_bot", "pos": Vector3(0, 0.5, 0), "slot": true, "allowed": ["Battery"]},
		]
	},
	"Carbon Fiber Body": {
		"type": "Frame", "weight": 180, "thrust": 0, "capacity": 0,
		"color": Color(0.2, 0.2, 0.2),
		"use_obj": false,
		"ports": [
			{"name": "fl", "pos": Vector3(2, 0.75, 2), "slot": true, "allowed": ["Motor"]},
			{"name": "fr", "pos": Vector3(2, 0.75, -2), "slot": true, "allowed": ["Motor"]},
			{"name": "bl", "pos": Vector3(-2, 0.75, 2), "slot": true, "allowed": ["Motor"]},
			{"name": "br", "pos": Vector3(-2, 0.75, -2), "slot": true, "allowed": ["Motor"]},
			{"name": "center", "pos": Vector3(0, 0.6, 0), "slot": true, "allowed": ["FC", "Battery", "ESC"]},
		]
	},
	"Motor 2205 2300KV": {
		"type": "Motor", "weight": 35, "thrust": 850, "capacity": 0,
		"color": Color(0.3, 0.3, 0.3),
		"ports": [{"name": "prop", "pos": Vector3(0, 0.5, 0), "slot": true, "allowed": ["Propeller"]}]
	},
	"Motor 2207 2400KV": {
		"type": "Motor", "weight": 42, "thrust": 1100, "capacity": 0,
		"color": Color(0.28, 0.28, 0.28),
		"ports": [{"name": "prop", "pos": Vector3(0, 0.5, 0), "slot": true, "allowed": ["Propeller"]}]
	},
	"Motor 2212 920KV": {
		"type": "Motor", "weight": 56, "thrust": 980, "capacity": 0,
		"color": Color(0.22, 0.22, 0.22),
		"ports": [{"name": "prop", "pos": Vector3(0, 0.5, 0), "slot": true, "allowed": ["Propeller"]}]
	},
	"Propeller 5045": {
		"type": "Propeller", "weight": 8, "thrust": 0, "capacity": 0,
		"color": Color(0.15, 0.15, 0.15), "ports": []
	},
	"Propeller 6045": {
		"type": "Propeller", "weight": 12, "thrust": 0, "capacity": 0,
		"color": Color(0.12, 0.12, 0.12), "ports": []
	},
	"Lipo 4S 1500mAh": {
		"type": "Battery", "weight": 185, "thrust": 0, "capacity": 1500,
		"color": Color(0.85, 0.7, 0.15), "ports": []
	},
	"F4 Flight Controller": {
		"type": "FC", "weight": 7, "thrust": 0, "capacity": 0,
		"color": Color(0.0, 0.35, 0.0), "ports": []
	},
	"4-in-1 ESC": {
		"type": "ESC", "weight": 15, "thrust": 0, "capacity": 0,
		"color": Color(0.0, 0.0, 0.5), "ports": []
	},
}

# Runtime state
var placed: Array[Dictionary] = []
var wires_data: Array[Dictionary] = []
var ghost: Node3D = null
var cur_id := ""
var ghost_rot := 0.0
var orbiting := false
var zoom := 10.0
var sim_state := "stopped" # stopped | playing | paused
var sim_time := 0.0

# ──────────────────────────── INIT ────────────────────────────────
func _ready():
	_build_comp_list()
	_build_floor()
	_build_grid()
	_place("PVC Pipe Frame", Vector3.ZERO)
	_update_all()
	play_btn.pressed.connect(_on_play)
	pause_btn.pressed.connect(_on_pause)
	stop_btn.pressed.connect(_on_stop)
	comp_list.item_selected.connect(_on_item_selected)
	hier_tree.item_selected.connect(_on_hier_item_selected)
	hier_del_btn.pressed.connect(_remove_selected)
	_log("Flyntic Studio initialized", "success")
	_log("Ready to design and simulate", "info")

# ──────────────────────────── UI BUILD ────────────────────────────
func _build_comp_list():
	comp_list.clear()
	for cat in CATEGORIES:
		var ci = comp_list.add_item("▸ " + cat)
		comp_list.set_item_selectable(ci, false)
		comp_list.set_item_custom_fg_color(ci, Color(0.5, 0.5, 0.5))
		for cid in CATEGORIES[cat]:
			if COMPONENTS.has(cid):
				var ii = comp_list.add_item("   " + cid)
				comp_list.set_item_metadata(ii, cid)
				var c = COMPONENTS[cid]
				match c.type:
					"Motor": comp_list.set_item_custom_fg_color(ii, Color(0.9, 0.4, 0.4))
					"Battery": comp_list.set_item_custom_fg_color(ii, Color(0.9, 0.8, 0.2))
					"Frame": comp_list.set_item_custom_fg_color(ii, Color(0.7, 0.7, 0.7))
					_: comp_list.set_item_custom_fg_color(ii, Color(0.6, 0.7, 0.8))

func _build_floor():
	var m = MeshInstance3D.new()
	var p = PlaneMesh.new()
	p.size = Vector2(100, 100)
	m.mesh = p
	var mat = StandardMaterial3D.new()
	mat.albedo_color = Color(0.14, 0.14, 0.16) # Darker, more neutral
	mat.metallic = 0.0
	mat.roughness = 1.0 # Pure matte
	mat.specular = 0.0 # No reflections
	m.material_override = mat
	scene_root.add_child(m)

func _build_grid():
	# Professional subtle grid on the floor
	var grid_size := 50
	var grid_mat = StandardMaterial3D.new()
	grid_mat.albedo_color = Color(0.25, 0.25, 0.28, 0.3)
	grid_mat.transparency = StandardMaterial3D.TRANSPARENCY_ALPHA
	grid_mat.shading_mode = StandardMaterial3D.SHADING_MODE_UNSHADED

	var span = float(grid_size * 2)
	for i in range(-grid_size, grid_size + 1):
		# Standard grid line
		var thickness = 0.015
		var color = grid_mat.albedo_color
		
		# Axis coloring
		if i == 0:
			thickness = 0.04
		
		# Draw X lines
		var lx = MeshInstance3D.new()
		var bx = BoxMesh.new()
		bx.size = Vector3(span, 0.001, thickness)
		lx.mesh = bx
		var lm = grid_mat.duplicate()
		if i == 0: lm.albedo_color = Color(0.8, 0.2, 0.2, 0.6) # Red X axis
		lx.material_override = lm
		lx.position = Vector3(0, 0.005, float(i))
		scene_root.add_child(lx)

		# Draw Z lines
		var lz = MeshInstance3D.new()
		var bz = BoxMesh.new()
		bz.size = Vector3(thickness, 0.001, span)
		lz.mesh = bz
		var lzm = grid_mat.duplicate()
		if i == 0: lzm.albedo_color = Color(0.2, 0.6, 0.8, 0.6) # Blue/Cyan Z axis
		lz.material_override = lzm
		lz.position = Vector3(float(i), 0.005, 0)
		scene_root.add_child(lz)

# ──────────────────────────── INPUT ───────────────────────────────
func _input(event):
	# Orbit camera
	if event is InputEventMouseButton:
		match event.button_index:
			MOUSE_BUTTON_MIDDLE:
				orbiting = event.pressed
			MOUSE_BUTTON_RIGHT:
				orbiting = event.pressed
			MOUSE_BUTTON_WHEEL_UP:
				zoom = max(3.0, zoom - 1.0)
				camera.position.z = zoom
				camera.position.y = zoom * 0.6
			MOUSE_BUTTON_WHEEL_DOWN:
				zoom = min(30.0, zoom + 1.0)
				camera.position.z = zoom
				camera.position.y = zoom * 0.6
			MOUSE_BUTTON_LEFT:
				if event.pressed and ghost:
					var snap = _find_snap()
					if snap:
						_place(cur_id, snap.pos, snap.port)
						_cancel_ghost()
					else:
						# Allow free placement with a warning
						var mpos = viewport.get_mouse_position()
						var ro = camera.project_ray_origin(mpos)
						var rd = camera.project_ray_normal(mpos)
						var gp = Plane(Vector3.UP, 0)
						var ghit = gp.intersects_ray(ro, rd)
						if ghit:
							_place(cur_id, ghit + Vector3(0, 0.5, 0))
							_cancel_ghost()
							_log("Placed freely (not snapped to port)", "warning")

	if event is InputEventMouseMotion and orbiting:
		pivot.rotate_y(-event.relative.x * 0.005)

	if event is InputEventKey and event.pressed:
		if event.keycode == KEY_R and ghost:
			ghost_rot += PI / 2
		if event.keycode == KEY_ESCAPE:
			_cancel_ghost()
		if event.keycode == KEY_DELETE or event.keycode == KEY_BACKSPACE:
			_remove_selected()

func _process(delta):
	if ghost:
		_move_ghost()
	if sim_state == "playing":
		_simulate(delta)

# ──────────────────────────── GHOST / PLACEMENT ───────────────────
func _on_item_selected(idx: int):
	var id = comp_list.get_item_metadata(idx)
	if id == null:
		return
	if id == "PVC Pipe Frame" or id == "Carbon Fiber Body":
		for c in placed:
			if c.type == "Frame":
				_log("Only one frame allowed!", "error")
				return
	cur_id = id
	_cancel_ghost()
	ghost = _build_mesh(id, true)
	components_group.add_child(ghost)
	_show_snap_hints(id)

func _move_ghost():
	var mpos = viewport.get_mouse_position()
	var ro = camera.project_ray_origin(mpos)
	var rd = camera.project_ray_normal(mpos)

	var snap = _find_snap()
	if snap:
		ghost.global_position = snap.pos
		_ghost_tint(Color(0, 1, 0.5, 0.6))
	else:
		# Follow cursor on ground plane
		var plane = Plane(Vector3.UP, 0)
		var hit = plane.intersects_ray(ro, rd)
		if hit == null:
			return
		ghost.global_position = hit + Vector3(0, 0.5, 0)
		_ghost_tint(Color(1, 1, 1, 0.25))
	ghost.rotation.y = ghost_rot

func _find_snap() -> Variant:
	var mpos = viewport.get_mouse_position()
	var ro = camera.project_ray_origin(mpos)
	var rd = camera.project_ray_normal(mpos)
	# Cast ray against MULTIPLE planes at different heights to find snap points
	var best_d := 2.5  # Generous snap distance
	var best = null

	for hint in snap_hints.get_children():
		# Cast ray on a plane at the SAME Y height as this hint
		var hint_y = hint.global_position.y
		var h_plane = Plane(Vector3.UP, hint_y)
		var hit = h_plane.intersects_ray(ro, rd)
		if hit == null:
			continue
		# Compare XZ distance only (ignore Y — we snap to the hint's exact Y)
		var dx = hit.x - hint.global_position.x
		var dz = hit.z - hint.global_position.z
		var d = sqrt(dx * dx + dz * dz)
		if d < best_d:
			best_d = d
			best = {"pos": hint.global_position, "port": hint.name}
	return best

func _show_snap_hints(id: String):
	_clear_children(snap_hints)
	var cdata = COMPONENTS[id]
	# Scan ALL placed components for matching ports
	for comp in placed:
		var ports = COMPONENTS[comp.id].get("ports", [])
		for port in ports:
			if port.get("slot", false) and port.get("allowed", []).has(cdata.type):
				# Check port not already occupied
				var occupied := false
				for other in placed:
					if other.get("port_name", "") == port.name and other.get("parent_id", -1) == comp.uid:
						occupied = true
						break
				if occupied:
					continue

				var hint = MeshInstance3D.new()
				var torus = TorusMesh.new()
				torus.inner_radius = 0.15
				torus.outer_radius = 0.25
				hint.mesh = torus
				hint.name = port.name
				var mat = StandardMaterial3D.new()
				mat.albedo_color = Color(0, 1, 0.8, 0.7)
				mat.emission_enabled = true
				mat.emission = Color(0, 1, 0.8)
				mat.emission_energy_multiplier = 2.0
				mat.transparency = StandardMaterial3D.TRANSPARENCY_ALPHA
				hint.material_override = mat
				snap_hints.add_child(hint)
				hint.global_position = comp.node.global_transform * port.pos

func _cancel_ghost():
	if ghost:
		ghost.queue_free()
		ghost = null
	_clear_children(snap_hints)
	ghost_rot = 0.0

func _ghost_tint(c: Color):
	if not ghost:
		return
	for ch in ghost.get_children():
		if ch is MeshInstance3D and ch.material_override:
			ch.material_override.albedo_color = c
		# Handle nested children from OBJ imports
		for sub in ch.get_children():
			if sub is MeshInstance3D and sub.material_override:
				sub.material_override.albedo_color = c

# ──────────────────────────── PLACE & WIRE ────────────────────────
func _place(id: String, pos: Vector3, port_name: String = ""):
	var node = _build_mesh(id, false)
	node.global_position = pos
	components_group.add_child(node)

	var uid = placed.size()
	var cdata = COMPONENTS[id]
	var entry := {
		"uid": uid, "id": id, "type": cdata.type,
		"node": node, "port_name": port_name,
		"parent_id": -1,
	}

	# Find parent
	if port_name != "":
		for comp in placed:
			var ports = COMPONENTS[comp.id].get("ports", [])
			for p in ports:
				if p.name == port_name:
					entry.parent_id = comp.uid
					break

	placed.append(entry)

	# Auto-wire motors to frame center
	if cdata.type == "Motor" and port_name != "":
		var center = Vector3.ZERO
		for c in placed:
			if c.type == "Frame":
				center = c.node.global_position + Vector3(0, 1.8, 0)
				break
		_add_wire(pos, center)

	_update_all()
	_log("Assembled: " + id, "success")

func _add_wire(from: Vector3, to: Vector3):
	var dist = from.distance_to(to)
	if dist < 0.1:
		return

	# Build a curved wire using multiple segments
	var wire_root = Node3D.new()
	var segments = 8
	var sag = max(0.1, dist * 0.15)
	var mid = (from + to) / 2.0
	mid.y -= sag

	# Simple 3-point curve
	for i in range(segments):
		var t0 = float(i) / segments
		var t1 = float(i + 1) / segments
		var p0 = _bezier3(from, mid, to, t0)
		var p1 = _bezier3(from, mid, to, t1)
		var seg_dist = p0.distance_to(p1)

		var cyl = MeshInstance3D.new()
		var cm = CylinderMesh.new()
		cm.top_radius = 0.03
		cm.bottom_radius = 0.03
		cm.height = seg_dist
		cyl.mesh = cm
		var mat = StandardMaterial3D.new()
		mat.albedo_color = Color(0.1, 0.1, 0.1)
		mat.metallic = 0.3
		cyl.material_override = mat
		wire_root.add_child(cyl)
		cyl.look_at_from_position((p0 + p1) / 2.0, p1, Vector3.UP)
		cyl.rotate_object_local(Vector3.RIGHT, PI / 2)

	wires_group.add_child(wire_root)

func _bezier3(a: Vector3, b: Vector3, c: Vector3, t: float) -> Vector3:
	var ab = a.lerp(b, t)
	var bc = b.lerp(c, t)
	return ab.lerp(bc, t)

# ──────────────────────────── BUILD MESH ──────────────────────────
func _build_mesh(id: String, is_ghost: bool) -> Node3D:
	var cdata = COMPONENTS[id]
	var root = Node3D.new()

	# Check if this component uses an OBJ model file
	if cdata.get("use_obj", false):
		_build_frame_from_obj(root, cdata)
	else:
		match cdata.type:
			"Frame":
				_build_frame_procedural(root)
			"Motor":
				_build_motor(root)
			"Propeller":
				_build_propeller(root)
			"Battery":
				_build_battery(root)
			"FC":
				_build_fc(root)
			"ESC":
				_build_esc(root)
			_:
				var m = MeshInstance3D.new()
				m.mesh = BoxMesh.new()
				root.add_child(m)

	var mat = StandardMaterial3D.new()
	if is_ghost:
		mat.transparency = StandardMaterial3D.TRANSPARENCY_ALPHA
		mat.albedo_color = Color(0, 1, 0.8, 0.3)
	else:
		mat.albedo_color = cdata.color
		mat.metallic = 0.1 # Very low metallic for matte look
		mat.roughness = 0.9 # High roughness for matte look
		mat.specular = 0.2 # low specular

	_apply_material_recursive(root, mat)
	return root

func _apply_material_recursive(node: Node, mat: Material):
	for ch in node.get_children():
		if ch is MeshInstance3D:
			ch.material_override = mat
		if ch.get_child_count() > 0:
			_apply_material_recursive(ch, mat)

func _build_frame_from_obj(root: Node3D, cdata: Dictionary):
	# Load the real OBJ model
	var obj_path = cdata.get("obj_path", "")
	var mesh_res = load(obj_path)
	if mesh_res == null:
		_log("Failed to load OBJ: " + obj_path + ", using procedural frame", "warning")
		_build_frame_procedural(root)
		return

	var mi = MeshInstance3D.new()
	mi.mesh = mesh_res
	mi.scale = Vector3(FRAME_SCALE, FRAME_SCALE, FRAME_SCALE)
	root.add_child(mi)

	_log("Loaded PVC Pipe Frame from OBJ model", "info")

func _build_frame_procedural(root: Node3D):
	var arm_mat = StandardMaterial3D.new()
	arm_mat.albedo_color = Color(0.18, 0.18, 0.18)
	arm_mat.metallic = 0.3
	arm_mat.roughness = 0.5

	# 4 diagonal arms
	for i in range(4):
		var arm = MeshInstance3D.new()
		var bm = BoxMesh.new()
		bm.size = Vector3(4.5, 0.25, 0.35)
		arm.mesh = bm
		arm.material_override = arm_mat
		root.add_child(arm)
		var angle = PI / 4.0 + i * PI / 2.0
		arm.rotation.y = angle
		arm.position = Vector3(cos(angle) * 2, 0.75, -sin(angle) * 2)

		# Motor mount at tip
		var mount = MeshInstance3D.new()
		var cm = CylinderMesh.new()
		cm.top_radius = 0.45
		cm.bottom_radius = 0.45
		cm.height = 0.15
		mount.mesh = cm
		mount.material_override = arm_mat
		root.add_child(mount)
		mount.position = Vector3(cos(angle) * 4, 0.85, -sin(angle) * 4)

	# Top plate (main chassis)
	var top = MeshInstance3D.new()
	top.mesh = BoxMesh.new()
	top.mesh.size = Vector3(2.6, 0.1, 5.0)
	top.position.y = 1.0
	root.add_child(top)

	# Bottom plate
	var bot = MeshInstance3D.new()
	bot.mesh = BoxMesh.new()
	bot.mesh.size = Vector3(2.3, 0.1, 4.5)
	bot.position.y = 0.5
	root.add_child(bot)

	# Landing skids
	for side in [-1.0, 1.0]:
		var runner = MeshInstance3D.new()
		var rcyl = CylinderMesh.new()
		rcyl.top_radius = 0.06
		rcyl.bottom_radius = 0.06
		rcyl.height = 3.5
		runner.mesh = rcyl
		runner.rotation.x = PI / 2
		runner.position = Vector3(side * 1.3, -0.5, 0)
		root.add_child(runner)

	# Status LEDs
	var led_r = MeshInstance3D.new()
	led_r.mesh = BoxMesh.new()
	led_r.mesh.size = Vector3(0.1, 0.05, 0.1)
	var led_mat_r = StandardMaterial3D.new()
	led_mat_r.albedo_color = Color(0.2, 0, 0)
	led_mat_r.emission_enabled = true
	led_mat_r.emission = Color.RED
	led_mat_r.emission_energy_multiplier = 3.0
	led_r.material_override = led_mat_r
	led_r.position = Vector3(0.8, 1.06, 2.0)
	root.add_child(led_r)

	var led_g = MeshInstance3D.new()
	led_g.mesh = BoxMesh.new()
	led_g.mesh.size = Vector3(0.1, 0.05, 0.1)
	var led_mat_g = StandardMaterial3D.new()
	led_mat_g.albedo_color = Color(0, 0.2, 0)
	led_mat_g.emission_enabled = true
	led_mat_g.emission = Color.GREEN
	led_mat_g.emission_energy_multiplier = 3.0
	led_g.material_override = led_mat_g
	led_g.position = Vector3(-0.8, 1.06, 2.0)
	root.add_child(led_g)

	root.position.y = 0.7

func _build_motor(root: Node3D):
	# Stator
	var st = MeshInstance3D.new()
	st.mesh = CylinderMesh.new()
	st.mesh.top_radius = 0.4
	st.mesh.bottom_radius = 0.4
	st.mesh.height = 0.5
	root.add_child(st)
	# Bell/Rotor
	var bell = MeshInstance3D.new()
	bell.mesh = CylinderMesh.new()
	bell.mesh.top_radius = 0.45
	bell.mesh.bottom_radius = 0.45
	bell.mesh.height = 0.2
	bell.position.y = 0.25
	root.add_child(bell)
	# Shaft
	var shaft = MeshInstance3D.new()
	shaft.mesh = CylinderMesh.new()
	shaft.mesh.top_radius = 0.1
	shaft.mesh.bottom_radius = 0.1
	shaft.mesh.height = 0.3
	shaft.position.y = 0.5
	root.add_child(shaft)

func _build_propeller(root: Node3D):
	var blade = MeshInstance3D.new()
	blade.mesh = BoxMesh.new()
	blade.mesh.size = Vector3(4.5, 0.04, 0.25)
	blade.name = "prop_blade"
	root.add_child(blade)
	var hub = MeshInstance3D.new()
	hub.mesh = CylinderMesh.new()
	hub.mesh.top_radius = 0.12
	hub.mesh.bottom_radius = 0.12
	hub.mesh.height = 0.08
	root.add_child(hub)

func _build_battery(root: Node3D):
	var body = MeshInstance3D.new()
	body.mesh = BoxMesh.new()
	body.mesh.size = Vector3(1.5, 0.8, 3.5)
	root.add_child(body)

func _build_fc(root: Node3D):
	var pcb = MeshInstance3D.new()
	pcb.mesh = BoxMesh.new()
	pcb.mesh.size = Vector3(1.5, 0.08, 1.5)
	root.add_child(pcb)

func _build_esc(root: Node3D):
	var body = MeshInstance3D.new()
	body.mesh = BoxMesh.new()
	body.mesh.size = Vector3(1.0, 0.25, 1.8)
	root.add_child(body)

# ──────────────────────────── SIMULATION ──────────────────────────
func _on_play():
	var check = _preflight_check()
	if check.capability == "Cannot fly":
		_log("PRE-FLIGHT FAILED: " + check.reason, "error")
		sim_label.text = "FAILED"
		return

	sim_state = "playing"
	sim_time = 0.0
	sim_label.text = "Simulating..."
	topbar_status.text = "playing"
	cap_val.text = check.capability

	if check.capability == "Unstable":
		_log("WARNING: Unstable assembly - drone will tilt!", "warning")
	else:
		_log("Simulation started - stable flight", "success")

func _on_pause():
	if sim_state == "playing":
		sim_state = "paused"
		sim_label.text = "Paused"
		topbar_status.text = "paused"

func _on_stop():
	sim_state = "stopped"
	sim_label.text = "Ready"
	topbar_status.text = "stopped"
	# Reset positions
	components_group.rotation = Vector3.ZERO
	components_group.position.y = 0

func _simulate(delta: float):
	sim_time += delta
	var check = _preflight_check()

	# Propeller spin
	components_group.get_parent().propagate_call("_process", [delta])
	for comp in placed:
		if comp.type == "Propeller":
			for ch in comp.node.get_children():
				if ch.name == "prop_blade":
					ch.rotation.y += delta * 25.0

	if check.capability == "Cannot fly":
		# Gravity / fall
		components_group.position.y = lerp(components_group.position.y, 0.0, 0.1)
		return

	# Hover & bob
	var target_y = 3.0 + sin(sim_time * 1.5) * 0.15
	components_group.position.y = lerp(components_group.position.y, target_y, 0.04)

	# Tilt based on asymmetry
	var tilt_x = check.tilt_x * 0.2 + sin(sim_time * 2) * 0.015
	var tilt_z = check.tilt_z * 0.2 + cos(sim_time * 2) * 0.015
	components_group.rotation.x = lerp(components_group.rotation.x, tilt_x, 0.08)
	components_group.rotation.z = lerp(components_group.rotation.z, tilt_z, 0.08)

func _preflight_check() -> Dictionary:
	var motors = []
	var has_frame := false
	var has_battery := false
	var has_props := 0

	for c in placed:
		match c.type:
			"Frame": has_frame = true
			"Motor": motors.append(c)
			"Battery": has_battery = true
			"Propeller": has_props += 1

	if not has_frame:
		return {"capability": "Cannot fly", "reason": "No frame", "tilt_x": 0, "tilt_z": 0}
	if not has_battery:
		return {"capability": "Cannot fly", "reason": "No battery", "tilt_x": 0, "tilt_z": 0}
	if motors.size() < 2:
		return {"capability": "Cannot fly", "reason": "Need at least 2 motors", "tilt_x": 0, "tilt_z": 0}

	# Symmetry check
	var avg_x := 0.0
	var avg_z := 0.0
	for m in motors:
		avg_x += m.node.global_position.x
		avg_z += m.node.global_position.z

	if motors.size() > 0:
		avg_x /= motors.size()
		avg_z /= motors.size()

	var tilt_x = avg_z * 0.3
	var tilt_z = -avg_x * 0.3

	if has_props < motors.size():
		tilt_x += 0.5

	var cap = "Stable"
	if abs(tilt_x) > 0.1 or abs(tilt_z) > 0.1 or has_props < motors.size():
		cap = "Unstable"

	return {"capability": cap, "reason": "", "tilt_x": tilt_x, "tilt_z": tilt_z}

# ──────────────────────────── UPDATE UI ───────────────────────────
func _update_all():
	var tw := 0.0
	var tt := 0.0
	var bat_cap := 0
	for c in placed:
		var d = COMPONENTS[c.id]
		tw += d.weight
		tt += d.thrust
		bat_cap += d.get("capacity", 0)

	weight_val.text = "%.1f g" % tw
	thrust_val.text = "%.2f kg" % (tt / 1000.0)
	var ratio = (tt / tw) if tw > 0 else 0.0
	twr_val.text = "%.2f:1" % ratio

	# Capability badge
	if ratio >= 2.0:
		cap_val.text = "Good"
		cap_val.add_theme_color_override("font_color", Color(0.3, 0.9, 0.4))
	elif ratio >= 1.5:
		cap_val.text = "Marginal"
		cap_val.add_theme_color_override("font_color", Color(0.9, 0.8, 0.2))
	else:
		cap_val.text = "N/A"
		cap_val.remove_theme_color_override("font_color")

	bat_val.text = str(bat_cap) + " mAh"
	var draw_a = tt * 0.001 * 30 # rough amps estimate
	var ft_min = (bat_cap / 1000.0 * 60.0 / max(draw_a, 1)) if bat_cap > 0 else 0
	ft_val.text = "%.1f min" % ft_min

	comp_count.text = "  Components: " + str(placed.size())

	# Diagnostics
	_update_diagnostics()

	# Hierarchy tree sync
	hier_tree.clear()
	var root_item = hier_tree.create_item()
	root_item.set_text(0, "Drone")
	# root_item.set_icon(0, preload("res://icon_chip.png")) # If we had one
	
	for c in placed:
		var item = hier_tree.create_item(root_item)
		item.set_text(0, c.id)
		item.set_metadata(0, c.uid)
		# item.set_icon(0, preload("res://icon_box.png")) # If we had one

func _on_hier_item_selected():
	var item = hier_tree.get_selected()
	if item:
		var uid = item.get_metadata(0)
		# Highlight in 3D? We can do that by changing color temporarily
		_log("Selected: " + item.get_text(0), "info")

func _remove_selected():
	var item = hier_tree.get_selected()
	if item and item.get_parent(): # Don't delete root
		var uid = item.get_metadata(0)
		_remove_component(uid)

func _remove_component(uid: int):
	var found_idx = -1
	for i in range(placed.size()):
		if placed[i].uid == uid:
			found_idx = i
			break
	
	if found_idx != -1:
		var comp = placed[found_idx]
		if comp.type == "Frame":
			_log("Cannot remove the main frame!", "error")
			return
			
		_log("Removed: " + comp.id, "warning")
		comp.node.queue_free()
		placed.remove_at(found_idx)
		
		# Clear and rebuild wires
		_clear_children(wires_group)
		for c in placed:
			if c.type == "Motor" and c.get("port_name", "") != "":
				var center = Vector3.ZERO
				for f in placed:
					if f.type == "Frame":
						center = f.node.global_position + Vector3(0, 1.8, 0)
						break
				_add_wire(c.node.global_position, center)
				
		_update_all()
	else:
		_log("Nothing selected to delete", "info")

func _update_diagnostics():
	var issues := []
	var has_bat := false
	var has_frame := false
	var motor_count := 0
	var prop_count := 0

	for c in placed:
		match c.type:
			"Battery": has_bat = true
			"Frame": has_frame = true
			"Motor": motor_count += 1
			"Propeller": prop_count += 1

	if not has_bat:
		issues.append("[color=#f44336]No battery placed[/color]")
	if motor_count == 0:
		issues.append("[color=#f44336]No motors installed[/color]")
	elif motor_count < 4:
		issues.append("[color=#ff9800]Only %d motors (4 recommended)[/color]" % motor_count)
	if prop_count < motor_count:
		issues.append("[color=#ff9800]%d motors missing propellers[/color]" % (motor_count - prop_count))
	if issues.size() == 0:
		issues.append("[color=#4caf50]All systems nominal[/color]")

	diag_text.text = "\n".join(issues)

# ──────────────────────────── UTILS ───────────────────────────────
func _clear_children(n: Node):
	for c in n.get_children():
		c.queue_free()

func _log(msg: String, type: String = "info"):
	var c = "#aaa"
	match type:
		"success": c = "#4caf50"
		"error": c = "#f44336"
		"warning": c = "#ff9800"
	var t = Time.get_time_string_from_system()
	log_box.append_text("[color=%s][%s] %s[/color]\n" % [c, t, msg])
