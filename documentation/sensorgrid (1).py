import tkinter as tk
import requests
import xml.etree.ElementTree as ET

SENSOR_URL = "http://192.168.50.169:9000/"
POLL_MS = 16

root = tk.Tk()
root.title("BLFloor Sensor Grid")

canvas = tk.Canvas(root, bg="black", highlightthickness=0)
canvas.pack(fill="both", expand=True)

sensor_grid = []
rectangles = []
cols_count = 0
rows_count = 0


def parse_sensor_xml(text):
    root_xml = ET.fromstring(text)

    sensors_x = int(root_xml.attrib.get("sensorsX", 96))
    sensors_y = int(root_xml.attrib.get("sensorsY", 96))

    grid = [[False for _ in range(sensors_x)] for _ in range(sensors_y)]

    rows = root_xml.find("Rows")
    if rows is None:
        return grid

    for row in rows.findall("Row"):
        r = int(row.attrib["rownum"])
        values = row.attrib["values"].split(",")

        for c, value in enumerate(values):
            if r < sensors_y and c < sensors_x:
                grid[r][c] = value.strip() == "*"

    return grid


def rebuild_rectangles():
    global rectangles

    canvas.delete("all")
    rectangles = []

    for r in range(rows_count):
        row_rects = []
        for c in range(cols_count):
            rect = canvas.create_rectangle(0, 0, 0, 0, outline="", fill="black")
            row_rects.append(rect)
        rectangles.append(row_rects)

    resize_grid()


def resize_grid(event=None):
    if not rectangles:
        return

    win_w = canvas.winfo_width()
    win_h = canvas.winfo_height()

    grid_aspect = cols_count / rows_count
    win_aspect = win_w / win_h

    if win_aspect > grid_aspect:
        draw_h = win_h
        draw_w = draw_h * grid_aspect
    else:
        draw_w = win_w
        draw_h = draw_w / grid_aspect

    offset_x = (win_w - draw_w) / 2
    offset_y = (win_h - draw_h) / 2

    cell_w = draw_w / cols_count
    cell_h = draw_h / rows_count

    for r in range(rows_count):
        for c in range(cols_count):
            x1 = offset_x + c * cell_w
            y1 = offset_y + r * cell_h
            x2 = x1 + cell_w
            y2 = y1 + cell_h

            canvas.coords(rectangles[r][c], x1, y1, x2, y2)


def update_grid(grid):
    global sensor_grid, rows_count, cols_count

    sensor_grid = grid
    new_rows = len(grid)
    new_cols = len(grid[0]) if new_rows else 0

    if new_rows != rows_count or new_cols != cols_count:
        rows_count = new_rows
        cols_count = new_cols
        rebuild_rectangles()

    for r in range(rows_count):
        for c in range(cols_count):
            canvas.itemconfig(
                rectangles[r][c],
                fill="lime green" if grid[r][c] else "black"
            )


def poll_sensors():
    try:
        response = requests.get(SENSOR_URL, timeout=0.1)
        response.raise_for_status()

        grid = parse_sensor_xml(response.text)
        update_grid(grid)

    except Exception as e:
        print("Sensor read error:", e)

    root.after(POLL_MS, poll_sensors)


canvas.bind("<Configure>", resize_grid)

poll_sensors()
root.mainloop()